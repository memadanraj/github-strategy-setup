-- Owner-checked scene creation/deletion with serialized positions.
-- Locking the parent project serializes scene list mutations for a project.
create or replace function public.create_project_scene(
  _project_id uuid,
  _title text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  _next_position integer;
  _scene_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Project not found or not owned by current user';
  end if;

  select coalesce(max(position), -1) + 1
  into _next_position
  from public.scenes
  where project_id = _project_id;

  insert into public.scenes(project_id, position, title)
  values (_project_id, _next_position, coalesce(nullif(left(btrim(_title), 120), ''), 'New scene'))
  returning id into _scene_id;

  return _scene_id;
end;
$$;

create or replace function public.delete_project_scene(
  _project_id uuid,
  _scene_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Project not found or not owned by current user';
  end if;

  delete from public.scenes
  where id = _scene_id and project_id = _project_id;

  if not found then return false; end if;

  with desired as (
    select id, row_number() over (order by position, created_at, id)::integer - 1 as new_position
    from public.scenes
    where project_id = _project_id
  )
  update public.scenes as scenes
  set position = desired.new_position, updated_at = now()
  from desired
  where scenes.id = desired.id;

  return true;
end;
$$;

revoke all on function public.create_project_scene(uuid, text) from public, anon;
grant execute on function public.create_project_scene(uuid, text) to authenticated;
revoke all on function public.delete_project_scene(uuid, uuid) from public, anon;
grant execute on function public.delete_project_scene(uuid, uuid) to authenticated;
