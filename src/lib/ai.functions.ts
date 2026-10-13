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

    const { runAiTask } = await import("./ai-jobs.server");
    const short = project.format === "short";
    const result = await runAiTask<DraftScenes, { count: number; sceneIds: string[] }>({
      supabase,
      taskSlug: "draft_scenes",
      projectId: project.id,
      input: { idea, sceneCount: data.sceneCount },
      schemaName: "scene_outline",
      schema: sceneSchema,
      instructions:
        "You are a YouTube video producer. Break the idea into a high-retention scene outline. Scene 1 is a strong hook. Narration is the spoken voiceover for that scene. visual_prompt is a concise, concrete description of what is on screen. Keep durations realistic.",
      prompt: `Video idea: ${idea}\\nFormat: ${short ? "YouTube Short (vertical, under 60 seconds total)" : "Long-form YouTube video"}\\nNumber of scenes: ${data.sceneCount}`,
      persist: async (draft) => {
        const safeDrafts = z.array(z.object({
          title: z.string(),
          narration: z.string(),
          visual_prompt: z.string(),
          duration_seconds: z.number().finite(),
        })).parse(draft.scenes.slice(0, data.sceneCount));
        if (safeDrafts.length === 0) throw new Error("AI returned no usable scenes.");

        const { count, error: countError } = await supabase
          .from("scenes")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id);
        if (countError) throw new Error("Couldn't load existing scene order.");

        const start = count ?? 0;
        const rows = safeDrafts.map((scene, index) => ({
          id: crypto.randomUUID(),
          project_id: project.id,
          position: start + index,
          title: scene.title.slice(0, 120) || `Scene ${start + index + 1}`,
          narration: scene.narration,
          visual_prompt: scene.visual_prompt,
          duration_seconds: Math.max(1, Math.min(120, Math.round(scene.duration_seconds))),
        }));
        const sceneIds = rows.map((row) => row.id);
        const { error: insertError } = await supabase.from("scenes").insert(rows);
        if (insertError) {
          // The insert request may have committed even if its response was lost.
          // IDs are generated here so a safe, project-scoped cleanup can reconcile it.
          const { error: cleanupError } = await supabase
            .from("scenes")
            .delete()
            .eq("project_id", project.id)
            .in("id", sceneIds);
          if (cleanupError) {
            throw new Error("Scene save failed and cleanup could not be confirmed; manual reconciliation is required.");
          }
          throw new Error("Couldn't save scenes.");
        }
        return { count: rows.length, sceneIds };
      },
      rollback: async (persisted) => {
        if (persisted.sceneIds.length === 0) return;
        const { error: cleanupError } = await supabase
          .from("scenes")
          .delete()
          .eq("project_id", project.id)
          .in("id", persisted.sceneIds);
        if (cleanupError) throw new Error("Could not remove scenes after confirmed job failure.");
      },
    });

    if (!result.ok) return result;
    return { ok: true as const, count: result.value.count };
  });
