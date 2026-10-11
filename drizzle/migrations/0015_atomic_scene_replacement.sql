-- Atomically replace a project's scenes. If validation or any insert fails,
-- PostgreSQL rolls back the DELETE too, preserving the previous scene list.
create or replace function public.replace_project_scenes(
  _project_id uuid,
  _scenes jsonb
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  _count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if _project_id is null then
    raise exception 'Project is required';
  end if;
  if jsonb_typeof(_scenes) is distinct from 'array' then
    raise exception 'Scene list must be a JSON array';
  end if;
  if jsonb_array_length(_scenes) < 1 or jsonb_array_length(_scenes) > 60 then
    raise exception 'Scene list must contain between 1 and 60 scenes';
  end if;

  perform 1
  from public.projects
  where id = _project_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found or not owned by current user';
  end if;

  delete from public.scenes where project_id = _project_id;

  insert into public.scenes (
    project_id,
    position,
    title,
    narration,
    visual_prompt,
    duration_seconds
  )
  select
    _project_id,
    (item.ordinality - 1)::integer,
    coalesce(nullif(left(btrim(item.value->>'title'), 120), ''), 'Scene ' || item.ordinality),
    nullif(btrim(item.value->>'narration'), ''),
    nullif(btrim(item.value->>'visual_prompt'), ''),
    greatest(1, least(120, round(coalesce(nullif(item.value->>'duration_seconds', '')::numeric, 5))))
  from jsonb_array_elements(_scenes) with ordinality as item(value, ordinality);

  get diagnostics _count = row_count;
  return _count;
end;
$$;

revoke all on function public.replace_project_scenes(uuid, jsonb) from public, anon;
grant execute on function public.replace_project_scenes(uuid, jsonb) to authenticated;
