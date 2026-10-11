import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  const body = await res.text().catch(() => "");
  let detail = "";
  try {
    const json = JSON.parse(body);
    detail = json?.error?.message ?? json?.message ?? json?.detail ?? "";
  } catch {
    detail = body.slice(0, 240);
  }
  if (res.status === 429) return "AI is busy right now. Please try again shortly.";
  if (res.status === 402) return "AI credits for this workspace are exhausted.";
  return detail ? `${fallback} (${detail})` : `${fallback} (${res.status}).`;
}

function clipSeconds(sceneDuration: number): "4" | "6" | "8" {
  if (sceneDuration <= 5) return "4";
  if (sceneDuration <= 7) return "6";
  return "8";
}

async function fetchMediaBytes(url: string, apiKey: string): Promise<Buffer | null> {
  const headerOptions = [
    {},
    {
      Authorization: `Bearer ${apiKey}`,
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "tanstack-ai",
    },
  ];

  for (const headers of headerOptions) {
    const res = await fetch(url, { headers: headers as Record<string, string> });
    if (!res.ok) continue;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

async function fetchVideoContent(jobId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`${GATEWAY}/videos/${encodeURIComponent(jobId)}/content`, {
    headers: gatewayHeaders(apiKey, false),
  });
  if (!res.ok) {
    throw new Error(await gatewayError(res, "The generated clip could not be downloaded"));
  }
  return Buffer.from(await res.arrayBuffer());
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
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: gatewayHeaders(apiKey),
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: vertical ? "1024x1536" : "1536x1024",
    }),
  });

  if (!res.ok) {
    throw new Error(await gatewayError(res, "Image generation failed"));
  }

  const json = await res.json();
  const item = json.data?.[0];

  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");

  if (item?.url) {
    const bytes = await fetchMediaBytes(item.url, apiKey);
    if (bytes) return bytes;
  }

  throw new Error("AI returned no downloadable image.");
}

async function generateClip(
  apiKey: string,
  model: string,
  prompt: string,
  durationSeconds: number,
  vertical: boolean,
): Promise<Buffer> {
  const start = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: gatewayHeaders(apiKey),
    body: JSON.stringify({
      model,
      prompt,
      size: vertical ? "720x1280" : "1280x720",
      seconds: clipSeconds(durationSeconds),
    }),
  });

  if (!start.ok) {
    throw new Error(await gatewayError(start, "Clip generation failed to start"));
  }

  const job = await start.json();
  const id = job.id;

  if (!id) throw new Error("Clip generation failed to start: gateway returned no job ID.");

  const deadline = Date.now() + 10 * 60 * 1000;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const poll = await fetch(`${GATEWAY}/videos/${encodeURIComponent(id)}`, {
      headers: gatewayHeaders(apiKey, false),
    });
    const info = await poll.json().catch(() => ({}));

    if (!poll.ok) {
      throw new Error(await gatewayError(poll, "Clip status check failed"));
    }

    if (info.status === "completed" || info.status === "succeeded") {
      const url: string | undefined =
        info.url ??
        info.video_url ??
        info.video?.url ??
        info.output?.url;

      if (url) {
        const bytes = await fetchMediaBytes(url, apiKey);
        if (bytes) return bytes;
      }

      return fetchVideoContent(id, apiKey);
    }

    if (info.status === "failed" || info.status === "error" || info.status === "cancelled") {
      throw new Error(info.error?.message ?? info.error ?? "Clip generation failed.");
    }

    if (Date.now() > deadline) {
      throw new Error("Clip generation timed out after 10 minutes.");
    }
  }
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

  try {
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

    const path = `${ctx.project.user_id}/${opts.projectId}/${crypto.randomUUID()}.${out.ext}`;

    const up = await supabaseAdmin.storage
      .from("project-assets")
      .upload(path, out.bytes, { contentType: out.contentType });

    if (up.error) throw new Error("Couldn't store the generated file");

    const name = `${scene.title} — AI ${out.kind}`;
    const { error: ae } = await supabaseAdmin.from("assets").insert({
      project_id: opts.projectId,
      kind: out.kind,
      name,
      storage_path: path,
      meta: { ai: true, task: opts.taskSlug, scene_id: opts.sceneId },
    });

    if (ae) throw new Error("Couldn't register the asset");

    await supabaseAdmin
      .from("scenes")
      .update(out.kind === "image" ? { image_path: path } : { clip_path: path })
      .eq("id", opts.sceneId);

    await supabaseAdmin.rpc("complete_generation_job", {
      _job_id: jobId,
      _output: { path },
    });

    return { ok: true as const, path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI generation failed";
    console.error(`${opts.taskSlug} failed`, e);
    await supabaseAdmin.rpc("fail_generation_job", {
      _job_id: jobId,
      _error: msg,
    });
    return { ok: false as const, error: `${msg} Your credits were refunded.` };
  }
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
      return { ok: false as const, error: je?.message?.includes("INSUFFICIENT_CREDITS") ? "Not enough credits." : "Couldn't start the AI job." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");
      const vertical = ctx.project.format === "short";
      const start = await fetch(`${GATEWAY}/videos`, {
        method: "POST",
        headers: gatewayHeaders(apiKey),
        body: JSON.stringify({
          model: task?.model ?? "google/veo-3.1-lite",
          prompt: composePrompt(ctx.project, ctx.characters, scene.visual_prompt),
          size: vertical ? "720x1280" : "1280x720",
          seconds: clipSeconds(Number(scene.duration_seconds) || 5),
        }),
      });
      if (!start.ok) throw new Error(await gatewayError(start, "Clip generation failed to start"));
      const job = await start.json();
      if (!job.id) throw new Error("Clip generation failed to start.");
      await supabaseAdmin.from("generation_jobs").update({ output: { provider_job_id: job.id } }).eq("id", jobId as string);
      return { ok: true as const, jobId: jobId as string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Clip generation failed";
      await supabaseAdmin.rpc("fail_generation_job", { _job_id: jobId as string, _error: msg });
      return { ok: false as const, error: `${msg} Your credits were refunded.` };
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
      await supabaseAdmin.rpc("fail_generation_job", { _job_id: job.id, _error: msg });
      return { status: "failed" as const, error: `${msg} Your credits were refunded.` };
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
      const poll = await fetch(`${GATEWAY}/videos/${encodeURIComponent(providerId)}`, { headers: gatewayHeaders(apiKey, false) });
      if (!poll.ok) {
        if (poll.status === 429 || poll.status >= 500) return { status: "running" as const };
        return fail(await gatewayError(poll, "Clip status check failed"));
      }
      const info = await poll.json().catch(() => ({}));
      if (info.status === "failed" || info.status === "error" || info.status === "cancelled") {
        return fail(info.error?.message ?? (typeof info.error === "string" ? info.error : "Clip generation failed."));
      }
      if (info.status !== "completed" && info.status !== "succeeded") return { status: "running" as const };

      const url: string | undefined = info.url ?? info.video_url ?? info.video?.url ?? info.output?.url;
      const bytes = (url ? await fetchMediaBytes(url, apiKey) : null) ?? (await fetchVideoContent(providerId, apiKey));
      const sceneId = job.input?.sceneId as string;
      const { data: project } = await supabaseAdmin.from("projects").select("user_id").eq("id", job.project_id).maybeSingle();
      const { data: scene } = await supabaseAdmin.from("scenes").select("title").eq("id", sceneId).maybeSingle();
      const path = `${project!.user_id}/${job.project_id}/${crypto.randomUUID()}.mp4`;
      const up = await supabaseAdmin.storage.from("project-assets").upload(path, bytes, { contentType: "video/mp4" });
      if (up.error) throw new Error("Couldn't store the generated file");
      await supabaseAdmin.from("assets").insert({
        project_id: job.project_id, kind: "video", name: `${scene?.title ?? "Scene"} — AI video`,
        storage_path: path, meta: { ai: true, task: "generate_clip", scene_id: sceneId },
      });
      await supabaseAdmin.from("scenes").update({ clip_path: path }).eq("id", sceneId);
      await supabaseAdmin.rpc("complete_generation_job", { _job_id: job.id, _output: { path, provider_job_id: providerId } });
      return { status: "complete" as const };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Clip generation failed");
    }
  });
