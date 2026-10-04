CREATE TABLE public.project_writing (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  research jsonb,
  hooks jsonb,
  titles jsonb,
  script text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_writing TO authenticated;
GRANT ALL ON public.project_writing TO service_role;
ALTER TABLE public.project_writing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage writing" ON public.project_writing FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

INSERT INTO public.ai_tasks (slug, name, model, credit_cost) VALUES
 ('topic_research','Topic research','openai/gpt-6-astra',5),
 ('hooks_titles','Hooks & titles','openai/gpt-6-astra',3),
 ('full_script','Full script','openai/gpt-6-astra',15),
 ('script_to_scenes','Script to scenes','openai/gpt-6-astra',5)
ON CONFLICT (slug) DO NOTHING;