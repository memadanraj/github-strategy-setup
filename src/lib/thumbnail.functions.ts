import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev";

const STYLES: Record<string, string> = {
  bold: "high-contrast YouTube thumbnail, saturated colors, dramatic rim lighting, expressive close-up subject",
  minimal: "clean minimal YouTube thumbnail, lots of negative space, one strong subject, soft gradient background",
  documentary: "moody documentary YouTube thumbnail, cinematic shadows, desaturated tones with one accent color",
  explainer: "bright explainer-style YouTube thumbnail, simple illustrated objects, arrows and circles for emphasis",
};

export const generateThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      projectId: z.string().uuid(),
      headline: z.string().trim().max(40).default(""),
      concept: z.string().trim().max(500).default(""),
      style: z.enum(["bold", "minimal", "documentary", "explainer"]).default("bold"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project } = await supabase
      .from("projects").select("id,title,idea,user_id").eq("id", data.projectId).maybeSingle();
    if (!project) return { ok: false as const, error: "Project not found" };
    const subject = data.concept || project.idea || "";
    if (!subject.trim() && (!project.title || project.title === "Untitled project"))
      return { ok: false as const, error: "Describe the thumbnail or add a video idea first." };

    const { data: task } = await supabase.from("ai_tasks").select("model").eq("slug", "generate_thumbnail").maybeSingle();
    const { data: jobId, error: je } = await supabase.rpc("start_generation_job", {
      _task_slug: "generate_thumbnail", _project_id: data.projectId, _input: data,
    });
    if (je || !jobId) {
      return { ok: false as const, error: je?.message?.includes("INSUFFICIENT_CREDITS") ? "Not enough credits." : "Couldn't start the AI job." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured.");
      const text = data.headline
        ? `Large bold headline text reading exactly "${data.headline}", perfectly spelled, highly legible with thick outline, placed so it does not cover the subject.`
        : "No text.";
      const prompt = `${STYLES[data.style]}. 16:9 composition. Video: "${project.title}". Subject: ${subject}. ${text} No watermarks, no logos, no YouTube UI.`;
      const res = await fetch(`${GATEWAY}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: task?.model ?? "openai/gpt-image-2.5-sunburst", prompt, size: "1536x1024" }),
      });
      if (!res.ok) {
        console.error("thumbnail gateway error", res.status, await res.text().catch(() => ""));
        if (res.status === 429) throw new Error("AI is busy right now. Please try again shortly.");
        if (res.status === 402) throw new Error("AI credits for this workspace are exhausted.");
        throw new Error("Thumbnail generation failed.");
      }
      const json = await res.json();
      const b64: string | undefined = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("AI returned no image.");
      const path = `${project.user_id}/${project.id}/thumb-${crypto.randomUUID()}.png`;
      const up = await supabaseAdmin.storage.from("project-assets")
        .upload(path, Buffer.from(b64, "base64"), { contentType: "image/png" });
      if (up.error) throw new Error("Couldn't store the thumbnail.");
      const { error: ae } = await supabaseAdmin.from("assets").insert({
        project_id: project.id, kind: "thumbnail",
        name: data.headline ? `Thumbnail — ${data.headline}` : "Thumbnail",
        storage_path: path, meta: { ai: true, task: "generate_thumbnail", style: data.style },
      });
      if (ae) throw new Error("Couldn't save the thumbnail.");
      await supabaseAdmin.rpc("complete_generation_job", { _job_id: jobId, _output: { path } });
      return { ok: true as const, path };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI generation failed";
      console.error("thumbnail failed", e);
      await supabaseAdmin.rpc("fail_generation_job", { _job_id: jobId, _error: msg });
      return { ok: false as const, error: `${msg} Your credits were refunded.` };
    }
  });
