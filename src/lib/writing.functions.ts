import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTargetDurationSeconds, productionPlanContext } from "./production-plan";

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

export type Research = { angle: string; audience: string; key_points: string[]; facts: string[]; questions: string[] };
export type HookOption = { hook: string; style: string };
export type TitleOption = { title: string; why: string };

const input = z.object({ projectId: z.string().uuid() });

async function loadProject(supabase: any, projectId: string) {
  const { data: project } = await supabase.from("projects").select("id,title,idea,format,settings").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const { data: writing } = await supabase.from("project_writing").select("*").eq("project_id", projectId).maybeSingle();
  const rawTitle = ((project.title as string) || "").trim();
  const idea = ((project.idea as string) || (rawTitle === "Untitled project" ? "" : rawTitle)).trim();
  return { project, writing, idea, settings: project.settings, short: project.format === "short" };
}

async function saveWriting(supabase: any, projectId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("project_writing")
    .upsert({ project_id: projectId, ...patch, updated_at: new Date().toISOString() });
  if (error) throw new Error("Couldn't save results");
}

function researchText(r: Research | null | undefined) {
  if (!r) return "";
  return `\nResearch angle: ${r.angle}\nAudience: ${r.audience}\nKey points: ${r.key_points.join("; ")}\nFacts: ${r.facts.join("; ")}`;
}

export const researchTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await loadProject(context.supabase, data.projectId);
    if (!ctx) return { ok: false as const, error: "Project not found" };
    if (!ctx.idea) return { ok: false as const, error: "Add a video idea to the project first." };
    const { runAiTask } = await import("./ai-jobs.server");
    return runAiTask<Research, true>({
      supabase: context.supabase as any,
      taskSlug: "topic_research",
      projectId: data.projectId,
      input: { idea: ctx.idea },
      schemaName: "topic_research",
      schema: obj({ angle: str, audience: str, key_points: strArr, facts: strArr, questions: strArr }),
      instructions:
        "You are a YouTube content researcher. Find the most compelling angle, define the target audience, list 5-7 key talking points, 4-6 interesting facts worth fact-checking, and 3-5 questions viewers will have. Be specific, avoid filler.",
      prompt: `Video idea: ${ctx.idea}\nFormat: ${ctx.short ? "YouTube Short" : "Long-form video"}${productionPlanContext(ctx.settings)}`,
      persist: async (r) => { await saveWriting(context.supabase, data.projectId, { research: r }); return true; },
    });
  });

export const generateHooksTitles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await loadProject(context.supabase, data.projectId);
    if (!ctx) return { ok: false as const, error: "Project not found" };
    if (!ctx.idea) return { ok: false as const, error: "Add a video idea to the project first." };
    const { runAiTask } = await import("./ai-jobs.server");
    type Out = { hooks: HookOption[]; titles: TitleOption[] };
    return runAiTask<Out, true>({
      supabase: context.supabase as any,
      taskSlug: "hooks_titles",
      projectId: data.projectId,
      input: { idea: ctx.idea },
      schemaName: "hooks_titles",
      schema: obj({
        hooks: { type: "array", items: obj({ hook: str, style: str }) },
        titles: { type: "array", items: obj({ title: str, why: str }) },
      }),
      instructions:
        "You write viral YouTube openings. Produce 5 spoken opening hooks (first 5 seconds, each a different style: question, bold claim, story, stat, curiosity gap) and 6 click-worthy titles under 70 characters that are honest, not clickbait lies. 'why' is one short line explaining the psychology.",
      prompt: `Video idea: ${ctx.idea}${researchText(ctx.writing?.research)}${productionPlanContext(ctx.settings)}`,
      persist: async (r) => {
        await saveWriting(context.supabase, data.projectId, { hooks: r.hooks, titles: r.titles });
        return true;
      },
    });
  });

export const generateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.extend({ hook: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await loadProject(context.supabase, data.projectId);
    if (!ctx) return { ok: false as const, error: "Project not found" };
    if (!ctx.idea) return { ok: false as const, error: "Add a video idea to the project first." };
    const { runAiTask } = await import("./ai-jobs.server");
    type Out = { acts: { heading: string; text: string }[] };
    const targetDurationSeconds = getTargetDurationSeconds(ctx.settings, ctx.short ? "short" : "long");
    const targetWordCount = Math.round(targetDurationSeconds * 2.5);
    return runAiTask<Out, true>({
      supabase: context.supabase as any,
      taskSlug: "full_script",
      projectId: data.projectId,
      input: { idea: ctx.idea, hook: data.hook ?? null },
      schemaName: "full_script",
      schema: obj({ acts: { type: "array", items: obj({ heading: str, text: str }) } }),
      instructions: ctx.short
        ? `Write a tight YouTube Short voiceover script of about ${targetWordCount} words in 3 acts: Hook, Payoff, Call to action. Spoken, punchy, no stage directions.`
        : `Write a long-form YouTube voiceover script of about ${targetWordCount} words in 4-6 acts: Hook, Setup, Development acts with open loops, Climax/payoff, Outro with call to action. Spoken, conversational, no stage directions.`,
      prompt: `Video idea: ${ctx.idea}${data.hook ? `\nOpen with this hook: ${data.hook}` : ""}${researchText(ctx.writing?.research)}${productionPlanContext(ctx.settings)}`,
      persist: async (r) => {
        const script = r.acts.map((a) => `## ${a.heading}\n\n${a.text.trim()}`).join("\n\n");
        await saveWriting(context.supabase, data.projectId, { script });
        return true;
      },
    });
  });

export const scriptToScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await loadProject(context.supabase, data.projectId);
    if (!ctx) return { ok: false as const, error: "Project not found" };
    const script = (ctx.writing?.script as string | null)?.trim();
    if (!script) return { ok: false as const, error: "Write or generate a script first." };
    const { runAiTask } = await import("./ai-jobs.server");
    type Out = { scenes: { title: string; narration: string; visual_prompt: string; duration_seconds: number }[] };
    return runAiTask<Out, number>({
      supabase: context.supabase as any,
      taskSlug: "script_to_scenes",
      projectId: data.projectId,
      input: { chars: script.length },
      schemaName: "scene_breakdown",
      schema: obj({
        scenes: { type: "array", items: obj({ title: str, narration: str, visual_prompt: str, duration_seconds: { type: "number" } }) },
      }),
      instructions:
        "Split the script into scenes for a video editor. Narration must use the script's exact wording, covering it fully and in order. visual_prompt is a concrete on-screen description. duration_seconds ≈ words / 2.5.",
      prompt: `${script.slice(0, 20000)}${productionPlanContext(ctx.settings)}`,
      persist: async (r) => {
        const sb = context.supabase as any;
        const { normalizeSceneBreakdown } = await import("./scene-breakdown");
        const rows = normalizeSceneBreakdown(r.scenes);
        const { data: count, error } = await sb.rpc("replace_project_scenes", {
          _project_id: data.projectId,
          _scenes: rows,
        });
        if (error || count !== rows.length) {
          throw new Error("Couldn't replace scenes. Your previous scenes were preserved.");
        }
        return count;
      },
    });
  });
