import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DraftScenes = {
  scenes: { title: string; narration: string; visual_prompt: string; duration_seconds: number }[];
};

const sceneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "narration", "visual_prompt", "duration_seconds"],
        properties: {
          title: { type: "string" },
          narration: { type: "string" },
          visual_prompt: { type: "string" },
          duration_seconds: { type: "number" },
        },
      },
    },
  },
};

export const draftScenesWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ projectId: z.string().uuid(), sceneCount: z.number().int().min(3).max(15) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error: pe } = await supabase
      .from("projects")
      .select("id,title,idea,format")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pe || !project) return { ok: false as const, error: "Project not found" };
    const idea = (project.idea || project.title || "").trim();
    if (!idea) return { ok: false as const, error: "Add a video idea to the project first." };

    const { data: task } = await supabase.from("ai_tasks").select("model").eq("slug", "draft_scenes").maybeSingle();

    // Reserve credits + open job
    const { data: jobId, error: je } = await supabase.rpc("start_generation_job", {
      _task_slug: "draft_scenes",
      _project_id: project.id,
      _input: { idea, sceneCount: data.sceneCount },
    });
    if (je || !jobId) {
      const msg = je?.message?.includes("INSUFFICIENT_CREDITS") ? "Not enough credits." : "Couldn't start the AI job.";
      return { ok: false as const, error: msg };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");
      const { generateStructured } = await import("./ai-gateway.server");
      const short = project.format === "short";
      const result = await generateStructured<DraftScenes>({
        apiKey,
        model: task?.model ?? "openai/gpt-6-astra",
        schemaName: "scene_outline",
        schema: sceneSchema,
        instructions:
          "You are a YouTube video producer. Break the idea into a high-retention scene outline. Scene 1 is a strong hook. Narration is the spoken voiceover for that scene. visual_prompt is a concise, concrete description of what is on screen. Keep durations realistic.",
        input: `Video idea: ${idea}\nFormat: ${short ? "YouTube Short (vertical, under 60 seconds total)" : "Long-form YouTube video"}\nNumber of scenes: ${data.sceneCount}`,
      });

      const { count } = await supabase
        .from("scenes")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id);
      const start = count ?? 0;
      const rows = result.scenes.slice(0, data.sceneCount).map((s, i) => ({
        project_id: project.id,
        position: start + i,
        title: s.title.slice(0, 120) || `Scene ${start + i + 1}`,
        narration: s.narration,
        visual_prompt: s.visual_prompt,
        duration_seconds: Math.max(1, Math.min(120, Math.round(s.duration_seconds))),
      }));
      const { error: ie } = await supabase.from("scenes").insert(rows);
      if (ie) throw new Error("Couldn't save scenes");

      await supabaseAdmin.rpc("complete_generation_job", { _job_id: jobId, _output: { scenes: rows.length } });
      return { ok: true as const, count: rows.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI generation failed";
      console.error("draft_scenes failed", e);
      await supabaseAdmin.rpc("fail_generation_job", { _job_id: jobId, _error: msg });
      return { ok: false as const, error: `${msg} Your credits were refunded.` };
    }
  });
