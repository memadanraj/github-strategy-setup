import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { downloadRemoteMedia, remoteMediaHeaderVariants } from "./remote-media.server";
import { fetchVisualProvider, readProviderJson, readResponseTextLimited, VisualProviderRequestError } from "./visual-provider-http.server";
import { normalizeProviderVideoStatus, readProviderJobId, readProviderVideoError, readProviderVideoUrl } from "./video-job-contract";
import {
  persistGeneratedVisual,
  settleVisualJobFailure,
  type VisualJobFailureState,
} from "./visual-job-persistence";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function gatewayHeaders(apiKey: string, json = true) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${apiKey}`,
    "Lovable-API-Key": apiKey,
    "X-Lovable-AIG-SDK": "tanstack-ai",
  };
}

async function gatewayError(res: Response, fallback: string) {
  const body = await readResponseTextLimited(res, 8 * 1024).catch(() => "");
  let detail = "";
  try {
    const json: unknown = JSON.parse(body);
    if (typeof json === "object" && json !== null) {
      const record = json as Record<string, unknown>;
      const error = record["error"];
      if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>)["message"] === "string") {
        detail = (error as Record<string, string>)["message"];
      } else if (typeof record["message"] === "string") {
        detail = record["message"];
      } else if (typeof record["detail"] === "string") {
        detail = record["detail"];
      }
    }
  } catch {
    // Error bodies are intentionally bounded; unstructured content is not reflected.
  }
  if (res.status === 429) return "AI is busy right now. Please try again shortly.";
  if (res.status === 402) return "AI credits for this workspace are exhausted.";
  const safeDetail = detail.replace(/[\\r\\n\\t]/g, " ").slice(0, 160);
  return safeDetail ? `${fallback} (${safeDetail})` : `${fallback} (${res.status}).`;
}

function clipSeconds(sceneDuration: number): "4" | "6" | "8" {
  if (sceneDuration <= 5) return "4";
  if (sceneDuration <= 7) return "6";
  return "8";
}

async function fetchMediaBytes(url: string, apiKey: string): Promise<Buffer | null> {
  // Provider-supplied output URLs are untrusted. Never send gateway secrets to
  // arbitrary CDNs or attacker-controlled URLs; credentials are only appropriate
  // for the gateway's own origin.
  const headerOptions = remoteMediaHeaderVariants(url, GATEWAY, {
    Authorization: `Bearer ${apiKey}`,
    "Lovable-API-Key": apiKey,
    "X-Lovable-AIG-SDK": "tanstack-ai",
  });
  if (headerOptions.length === 0) return null;

  for (const headers of headerOptions) {
    try {
      const result = await downloadRemoteMedia(url, {
        headers,
        timeoutMs: 45_000,
        maxBytes: 128 * 1024 * 1024,
        allowedContentTypes: ["image/", "video/", "application/octet-stream"],
      });
      return Buffer.from(result.bytes);
    } catch {
      // Some provider URLs require gateway credentials. Try both header variants,
      // then allow the caller to use the provider's authenticated content endpoint.
    }
  }
  return null;
}
async function fetchVideoContent(jobId: string, apiKey: string): Promise<Buffer> {
  const result = await downloadRemoteMedia(
    `${GATEWAY}/videos/${encodeURIComponent(jobId)}/content`,
    {
      headers: gatewayHeaders(apiKey, false),
      timeoutMs: 45_000,
      maxBytes: 128 * 1024 * 1024,
      allowedContentTypes: ["video/", "application/octet-stream"],
    },
  );
  return Buffer.from(result.bytes);
}

type CheckedVisualAdmin = {
  rpc: (
    name: "fail_generation_job_checked",
    args: { _job_id: string; _error: string },
  ) => PromiseLike<{ data: string | null; error: { message: string } | null }>;
};

async function failVisualJobChecked(
  admin: CheckedVisualAdmin,
  jobId: string,
  message: string,
): Promise<VisualJobFailureState> {
  const { data, error } = await admin.rpc("fail_generation_job_checked", {
    _job_id: jobId,
    _error: message.slice(0, 500),
  });
  if (error || typeof data !== "string") {
    throw new Error("Could not confirm generation job settlement.");
  }
  const allowedStates: VisualJobFailureState[] = [
    "failed_refunded",
    "failed_without_reservation",
    "already_failed",
    "already_complete",
    "not_found",
    "not_active",
  ];
  if (!allowedStates.includes(data as VisualJobFailureState)) {
    throw new Error("Generation job settlement returned an unknown state.");
  }
  return data as VisualJobFailureState;
}

async function buildVisualContext(supabase: any, projectId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id,title,idea,format,visual_style,user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: characters } = await supabase
    .from("characters")
    .select("name,description,visual_notes")
    .eq("project_id", projectId);

  return { project, characters: characters ?? [] };
}

function styleDirective(style: string) {
  const map: Record<string, string> = {
    cinematic: "cinematic film still, dramatic lighting, shallow depth of field, 35mm",
    photoreal: "photorealistic, natural lighting, high detail photography",
    anime: "anime style, cel shaded, vibrant colors",
    flat: "flat vector illustration, bold shapes, minimal palette",
    watercolor: "watercolor painting, soft washes, textured paper",
    retro: "retro 80s poster style, grain, neon accents",
    darkdoc: "dark documentary mood, moody shadows, desaturated tones",
  };
  return map[style] ?? map["cinematic"]!;
}

function composePrompt(project: any, characters: any[], visualPrompt: string) {
  const charBlock = characters.length
    ? `\nCharacters that must appear consistently: ${characters
        .map((c) => `${c.name}: ${[c.description, c.visual_notes].filter(Boolean).join("; ")}`)
        .join(" | ")}`
    : "";
  const aspect = project.format === "short" ? "vertical 9:16 composition" : "widescreen 16:9 composition";
  return `${styleDirective(project.visual_style)}. ${aspect}. Scene: ${visualPrompt}.${charBlock}\nNo text, no watermarks, no logos.`;
}

async function generateImage(apiKey: string, model: string, prompt: string, vertical: boolean): Promise<Buffer> {
  const res = await fetchVisualProvider(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: gatewayHeaders(apiKey),
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: vertical ? "1024x1536" : "1536x1024",
    }),
  }, 120_000);

  if (!res.ok) {
    throw new Error(await gatewayError(res, "Image generation failed"));
  }

  const json = await readProviderJson<{ data?: Array<{ b64_json?: unknown; url?: unknown }> }>(
    res,
    44 * 1024 * 1024,
  );
  const item = json.data?.[0];

  if (typeof item?.b64_json === "string" && item.b64_json.length > 0) {
    if (item.b64_json.length > 40 * 1024 * 1024) throw new Error("Generated image exceeds the configured size limit.");
    return Buffer.from(item.b64_json, "base64");
  }

  if (typeof item?.url === "string" && item.url.trim()) {
    const bytes = await fetchMediaBytes(item.url, apiKey);
    if (bytes) return bytes;
  }

  throw new Error("AI returned no downloadable image.");
}

async function runVisualJob(opts: {
  supabase: any;
  taskSlug: "generate_image" | "generate_clip";
  projectId: string;
  sceneId: string;
  input: Record<string, unknown>;
  work: (ctx: {
    project: any;
    characters: any[];
    scene: any;
    apiKey: string;
    model: string;
  }) => Promise<{ bytes: Buffer; ext: string; contentType: string; kind: string }>;
}) {
  const { supabase } = opts;
  const ctx = await buildVisualContext(supabase, opts.projectId);
  if (!ctx) return { ok: false as const, error: "Project not found" };

  const { data: scene } = await supabase
    .from("scenes")
    .select("id,title,visual_prompt,narration,duration_seconds")
    .eq("id", opts.sceneId)
    .eq("project_id", opts.projectId)
    .maybeSingle();

  if (!scene) return { ok: false as const, error: "Scene not found" };
  if (!scene.visual_prompt?.trim()) {
    return { ok: false as const, error: "Add a visual description to the scene first." };
  }

  const { data: task } = await supabase
    .from("ai_tasks")
    .select("model")
    .eq("slug", opts.taskSlug)
    .maybeSingle();

  const { data: jobId, error: je } = await supabase.rpc("start_generation_job", {
    _task_slug: opts.taskSlug,
    _project_id: opts.projectId,
    _input: opts.input,
  });

  if (je || !jobId) {
    const msg = je?.message?.includes("INSUFFICIENT_CREDITS")
      ? "Not enough credits."
      : "Couldn't start the AI job.";
    return { ok: false as const, error: msg };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const persistence = await persistGeneratedVisual({
    prepare: async () => {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");

      const out = await opts.work({
        project: ctx.project,
        characters: ctx.characters,
        scene,
        apiKey,
        model:
          task?.model ??
          (opts.taskSlug === "generate_image"
            ? "openai/gpt-image-2"
            : "google/veo-3.1-lite"),
      });
      return {
        ...out,
        path: `${ctx.project.user_id}/${opts.projectId}/${crypto.randomUUID()}.${out.ext}`,
      };
    },
    upload: async (out) => {
      const { error } = await supabaseAdmin.storage
        .from("project-assets")
        .upload(out.path, out.bytes, { contentType: out.contentType });
      if (error) throw new Error("Couldn't store the generated file.");
    },
    registerAsset: async (out) => {
      const { data: asset, error } = await supabaseAdmin
        .from("assets")
        .insert({
          project_id: opts.projectId,
          kind: out.kind,
          name: `${scene.title} — AI ${out.kind}`,
          storage_path: out.path,
          meta: { ai: true, task: opts.taskSlug, scene_id: opts.sceneId },
        })
        .select("id")
        .single();
      if (error || !asset?.id) throw new Error("Couldn't register the generated asset.");
      return asset.id as string;
    },
    attachScene: async (out) => {
      const { data: attached, error } = await supabaseAdmin
        .from("scenes")
        .update(out.kind === "image" ? { image_path: out.path } : { clip_path: out.path })
        .eq("id", opts.sceneId)
        .eq("project_id", opts.projectId)
        .select("id")
        .single();
      if (error || !attached?.id) throw new Error("Couldn't attach the generated file to its scene.");
    },
    completeJob: async (out, assetId) => {
      const { error } = await supabaseAdmin.rpc("complete_generation_job", {
        _job_id: jobId,
        _output: { path: out.path, asset_id: assetId, scene_id: opts.sceneId, task: opts.taskSlug },
      });
      if (error) throw new Error("Couldn't finalize the AI generation job.");
    },
    cleanupAsset: async (out) => {
      const sceneColumn = out.kind === "image" ? "image_path" : "clip_path";
      const sceneCleanup = await supabaseAdmin
        .from("scenes")
        .update(out.kind === "image" ? { image_path: null } : { clip_path: null })
        .eq("id", opts.sceneId)
        .eq("project_id", opts.projectId)
        .eq(sceneColumn, out.path);
      if (sceneCleanup.error) throw new Error("Scene media reference cleanup failed.");

      const { error } = await supabaseAdmin
        .from("assets")
        .delete()
        .eq("project_id", opts.projectId)
        .eq("storage_path", out.path);
      if (error) throw new Error("Asset-record cleanup failed.");
    },
    cleanupUpload: async (out) => {
      const { error } = await supabaseAdmin.storage.from("project-assets").remove([out.path]);
      if (error) throw new Error("Uploaded-file cleanup failed.");
    },
    failJob: async (message) => {
      const { data, error } = await supabaseAdmin.rpc("fail_generation_job_checked", {
        _job_id: jobId,
        _error: message.slice(0, 500),
      });
      if (error) throw new Error("Couldn't confirm AI job settlement.");
      const allowedStates = [
        "failed_refunded",
        "failed_without_reservation",
        "already_failed",
        "already_complete",
        "not_found",
        "not_active",
      ];
      if (typeof data !== "string" || !allowedStates.includes(data)) {
        throw new Error("AI job settlement returned an unknown state.");
      }
      return data as import("./visual-job-persistence").VisualJobFailureState;
    },
  });

  if (!persistence.ok) return { ok: false as const, error: persistence.error };
  return { ok: true as const, path: persistence.output.path };
}

export const generateSceneImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ projectId: z.string().uuid(), sceneId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    runVisualJob({
      supabase: context.supabase,
      taskSlug: "generate_image",
      projectId: data.projectId,
      sceneId: data.sceneId,
      input: { sceneId: data.sceneId },
      work: async ({ project, characters, scene, apiKey, model }) => ({
        bytes: await generateImage(
          apiKey,
          model,
          composePrompt(project, characters, scene.visual_prompt),
          project.format === "short",
        ),
        ext: "png",
        contentType: "image/png",
        kind: "image",
      }),
    }),
  );

export const CLIP_TIMEOUT_MS = 15 * 60 * 1000;

// Starts a clip in the background: reserves credits, kicks off the gateway job, returns immediately.
export const generateSceneClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ projectId: z.string().uuid(), sceneId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const ctx = await buildVisualContext(supabase, data.projectId);
    if (!ctx) return { ok: false as const, error: "Project not found" };
    const { data: scene } = await supabase
      .from("scenes").select("id,title,visual_prompt,duration_seconds")
      .eq("id", data.sceneId).eq("project_id", data.projectId).maybeSingle();
    if (!scene) return { ok: false as const, error: "Scene not found" };
    if (!scene.visual_prompt?.trim()) return { ok: false as const, error: "Add a visual description to the scene first." };

    const { data: running } = await supabase
      .from("generation_jobs").select("id").eq("task_slug", "generate_clip").eq("status", "running")
      .eq("project_id", data.projectId).contains("input", { sceneId: data.sceneId }).limit(1);
    if (running?.length) return { ok: true as const, jobId: running[0].id as string };

    const { data: task } = await supabase.from("ai_tasks").select("model").eq("slug", "generate_clip").maybeSingle();
    const { data: jobId, error: je } = await supabase.rpc("start_generation_job", {
      _task_slug: "generate_clip", _project_id: data.projectId, _input: { sceneId: data.sceneId },
    });
    if (je || !jobId) {
      // A concurrent request can win between the initial active-job lookup and
      // the credit-reserving RPC. Reuse that active job instead of charging or
      // surfacing a false failure to the second tab.
      if (je?.message?.includes("JOB_ALREADY_ACTIVE")) {
        const { data: active } = await supabase
          .from("generation_jobs")
          .select("id")
          .eq("task_slug", "generate_clip")
          .eq("status", "running")
          .eq("project_id", data.projectId)
          .contains("input", { sceneId: data.sceneId })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (active?.id) return { ok: true as const, jobId: active.id as string };
      }
      return {
        ok: false as const,
        error: je?.message?.includes("INSUFFICIENT_CREDITS")
          ? "Not enough credits."
          : "Couldn't start the AI job.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");
      const vertical = ctx.project.format === "short";
      const start = await fetchVisualProvider(`${GATEWAY}/videos`, {
        method: "POST",
        headers: gatewayHeaders(apiKey),
        body: JSON.stringify({
          model: task?.model ?? "google/veo-3.1-lite",
          prompt: composePrompt(ctx.project, ctx.characters, scene.visual_prompt),
          size: vertical ? "720x1280" : "1280x720",
          seconds: clipSeconds(Number(scene.duration_seconds) || 5),
        }),
      }, 45_000);
      if (!start.ok) throw new Error(await gatewayError(start, "Clip generation failed to start"));
      const job = await readProviderJson<unknown>(start, 256 * 1024).catch(() => null);
      const providerJobId = readProviderJobId(job);
      if (!providerJobId) throw new Error("Clip generation failed to start: gateway returned no valid job ID.");
      const { error: providerJobWriteError } = await supabaseAdmin
        .from("generation_jobs")
        .update({ output: { provider_job_id: providerJobId } })
        .eq("id", jobId as string);
      if (providerJobWriteError) {
        throw new Error("Clip started, but its provider job ID could not be saved. The job was failed to avoid a stuck credit reservation.");
      }
      return { ok: true as const, jobId: jobId as string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Clip generation failed";
      const outcome = await settleVisualJobFailure(
        (message) => failVisualJobChecked(supabaseAdmin, jobId as string, message),
        msg,
      );
      if (outcome.state === "already_complete") {
        return { ok: true as const, jobId: jobId as string };
      }
      return { ok: false as const, error: outcome.error };
    }
  });

// Checks a background clip once. Client calls this every few seconds.
export const checkSceneClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // RLS: user can only read their own jobs.
    const { data: job } = await supabase
      .from("generation_jobs").select("id,status,input,output,error,project_id,started_at,created_at")
      .eq("id", data.jobId).eq("task_slug", "generate_clip").maybeSingle();
    if (!job) return { status: "failed" as const, error: "Job not found" };
    if (job.status === "complete") return { status: "complete" as const };
    if (job.status === "failed") return { status: "failed" as const, error: `${job.error ?? "Clip failed."} Your credits were refunded.` };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fail = async (msg: string) => {
      const outcome = await settleVisualJobFailure(
        (message) => failVisualJobChecked(supabaseAdmin, job.id, message),
        msg,
      );
      if (outcome.state === "already_complete") return { status: "complete" as const };
      return { status: "failed" as const, error: outcome.error };
    };
    const startedAt = new Date(job.started_at ?? job.created_at).getTime();
    const providerId = job.output?.provider_job_id as string | undefined;
    if (!providerId) {
      return Date.now() - startedAt > 2 * 60 * 1000 ? fail("Clip never started.") : { status: "running" as const };
    }
    if (Date.now() - startedAt > CLIP_TIMEOUT_MS) return fail("Clip generation timed out.");

    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");
      let poll: Response;
      try {
        poll = await fetchVisualProvider(
          `${GATEWAY}/videos/${encodeURIComponent(providerId)}`,
          { headers: gatewayHeaders(apiKey, false) },
          20_000,
        );
      } catch (error) {
        if (error instanceof VisualProviderRequestError && error.transient) {
          // A single poll timeout/network failure should not fail a valid provider job.
          // Subsequent polls retry; the global clip deadline still bounds its lifetime.
          return { status: "running" as const };
        }
        throw error;
      }
      if (!poll.ok) {
        if (poll.status === 429 || poll.status >= 500) return { status: "running" as const };
        return fail(await gatewayError(poll, "Clip status check failed"));
      }
      const info = await readProviderJson<unknown>(poll, 512 * 1024);
      const providerStatus = normalizeProviderVideoStatus(info.status);
      if (providerStatus === "failed") {
        return fail(readProviderVideoError(info) ?? "Clip generation failed.");
      }
      if (providerStatus !== "completed") return { status: "running" as const };

      // Only one poll request may download and persist this provider result.
      const jobDownloadRpc = supabaseAdmin as unknown as {
        rpc: (
          name: "claim_generation_job_download",
          args: { _job_id: string },
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
      };
      const { data: claimed, error: claimError } = await jobDownloadRpc.rpc(
        "claim_generation_job_download",
        { _job_id: job.id },
      );
      if (claimError) throw new Error("Couldn't claim the clip download stage.");
      if (!claimed) return { status: "running" as const };

      const url = readProviderVideoUrl(info);
      const bytes = (url ? await fetchMediaBytes(url, apiKey) : null) ?? (await fetchVideoContent(providerId, apiKey));
      const sceneId = job.input?.sceneId as string | undefined;
      if (!sceneId) throw new Error("Clip job is missing its scene reference.");

      const { data: project, error: projectError } = await supabaseAdmin
        .from("projects").select("id,user_id").eq("id", job.project_id).maybeSingle();
      if (projectError || !project?.user_id) throw new Error("Project no longer exists for this clip.");
      const { data: scene, error: sceneError } = await supabaseAdmin
        .from("scenes").select("id,title").eq("id", sceneId).eq("project_id", job.project_id).maybeSingle();
      if (sceneError || !scene) throw new Error("Scene no longer exists for this clip.");

      const path = `${project.user_id}/${job.project_id}/${crypto.randomUUID()}.mp4`;
      const storage = supabaseAdmin.storage.from("project-assets");
      let uploadAttempted = false;
      let assetRegistrationAttempted = false;
      let assetId: string | undefined;
      let sceneAttached = false;
      let completionStarted = false;

      try {
        uploadAttempted = true;
        const up = await storage.upload(path, bytes, { contentType: "video/mp4" });
        if (up.error) throw new Error("Couldn't store the generated clip.");

        // The insert may have committed even if the response is lost, so cleanup
        // searches by project/path instead of relying on a returned asset ID.
        assetRegistrationAttempted = true;
        const { data: asset, error: assetError } = await supabaseAdmin
          .from("assets")
          .insert({
            project_id: job.project_id,
            kind: "video",
            name: `${scene.title || "Scene"} — AI video`,
            storage_path: path,
            meta: { ai: true, task: "generate_clip", scene_id: sceneId, provider_job_id: providerId },
          })
          .select("id")
          .single();
        if (assetError || !asset?.id) throw new Error("Couldn't register the generated clip asset.");
        assetId = asset.id;

        const { data: attached, error: sceneUpdateError } = await supabaseAdmin
          .from("scenes")
          .update({ clip_path: path })
          .eq("id", sceneId)
          .eq("project_id", job.project_id)
          .select("id")
          .single();
        if (sceneUpdateError || !attached?.id) throw new Error("Couldn't attach the generated clip to its scene.");
        sceneAttached = true;

        completionStarted = true;
        const { error: completionError } = await supabaseAdmin.rpc(
          "complete_generation_job",
          { _job_id: job.id, _output: { path, asset_id: assetId, provider_job_id: providerId } },
        );
        if (completionError) throw new Error("Couldn't finalize the clip job.");
      } catch (persistError) {
        const message = persistError instanceof Error ? persistError.message : "Clip persistence failed.";
        const outcome = await settleVisualJobFailure(
          (failureMessage) => failVisualJobChecked(supabaseAdmin, job.id, failureMessage),
          message,
          {
            completionMayHaveSucceeded: completionStarted && sceneAttached && Boolean(assetId),
            cleanupAsset: assetRegistrationAttempted
              ? async () => {
                  const { error } = await supabaseAdmin
                    .from("assets")
                    .delete()
                    .eq("project_id", job.project_id)
                    .eq("storage_path", path);
                  if (error) throw new Error("Asset record cleanup failed.");
                }
              : undefined,
            cleanupUpload: uploadAttempted
              ? async () => {
                  const { error } = await storage.remove([path]);
                  if (error) throw new Error("Uploaded clip cleanup failed.");
                }
              : undefined,
          },
        );
        if (outcome.completed) return { status: "complete" as const };
        return { status: "failed" as const, error: outcome.error };
      }
      return { status: "complete" as const };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Clip generation failed");
    }
  });
