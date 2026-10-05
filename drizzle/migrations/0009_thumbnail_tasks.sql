insert into public.ai_tasks (slug,name,description,model,credit_cost) values
('generate_image','Scene image','AI image for a scene','openai/gpt-image-2',20),
('generate_clip','Scene clip','AI video clip for a scene','google/veo-3.1-lite',150),
('generate_thumbnail','Thumbnail','AI YouTube thumbnail with headline text','openai/gpt-image-2.5-sunburst',25)
on conflict (slug) do nothing;