-- Reorder scenes as one authenticated transaction.
-- Positions are normalized after moving so gapped/duplicate legacy positions
-- cannot cause incorrect adjacent-swap behavior.
create or replace function public.move_project_scene(
  _project_id uuid,
  _scene_id uuid,
  _direction integer
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  _ordered_ids uuid[];
  _current_index integer;
  _target_index integer;
  _temp_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if _direction not in (-1, 1) then
    raise exception 'Invalid scene movement direction';
  end if;

  perform 1 from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;

  select array_agg(id order by position, created_at, id)
  into _ordered_ids
  from public.scenes
  where project_id = _project_id;

  if _ordered_ids is null then return false; end if;
  _current_index := array_position(_ordered_ids, _scene_id);
  if _current_index is null then return false; end if;
  _target_index := _current_index + _direction;
  if _target_index < 1 or _target_index > cardinality(_ordered_ids) then return false; end if;

  _temp_id := _ordered_ids[_current_index];
  _ordered_ids[_current_index] := _ordered_ids[_target_index];
  _ordered_ids[_target_index] := _temp_id;

  with desired as (
    select scene_id, ordinal::integer - 1 as new_position
    from unnest(_ordered_ids) with ordinality as ids(scene_id, ordinal)
  )
  update public.scenes as scenes
  set position = desired.new_position, updated_at = now()
  from desired
  where scenes.id = desired.scene_id and scenes.project_id = _project_id;

  return true;
end;
$$;

revoke all on function public.move_project_scene(uuid, uuid, integer) from public, anon;
grant execute on function public.move_project_scene(uuid, uuid, integer) to authenticated;
