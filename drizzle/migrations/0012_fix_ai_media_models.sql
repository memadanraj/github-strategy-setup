-- Phase 07 hotfix: align stored AI media tasks with the currently supported Lovable AI Gateway models.
-- 0009 used an older video model id and an older image model id. Existing installations
-- need an explicit update because the original migration used ON CONFLICT DO NOTHING.
update public.ai_tasks
set model = 'openai/gpt-image-2'
where slug = 'generate_image';

update public.ai_tasks
set model = 'google/veo-3.1-lite'
where slug = 'generate_clip';
