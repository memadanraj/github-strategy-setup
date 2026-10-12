-- Atomic, owner-checked project version snapshots and restores.
-- Saving serializes on the project row so concurrent saves cannot choose the same
-- version number. Restoring runs in one transaction, so a malformed snapshot or
-- a constraint failure cannot leave a project half-restored.

create or replace function public.create_project_version(
  _project_id uuid,
  _label text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  _project public.projects%rowtype;
  _next_version integer;
  _snapshot jsonb;
  _created public.project_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _project
  from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found or not owned by current user';
  end if;

  select coalesce(max(version_number), 0) + 1
  into _next_version
  from public.project_versions
  where project_id = _project_id;

  select jsonb_build_object(
    'schema_version', 2,
    'title', _project.title,
    'idea', _project.idea,
    'project', jsonb_build_object(
      'title', _project.title,
      'idea', _project.idea,
      'format', _project.format,
      'mode', _project.mode,
      'visual_style', _project.visual_style,
      'settings', _project.settings
    ),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'position', s.position,
        'title', s.title,
        'narration', s.narration,
        'visual_prompt', s.visual_prompt,
        'duration_seconds', s.duration_seconds,
        'image_path', s.image_path,
        'clip_path', s.clip_path
      ) order by s.position, s.created_at)
      from public.scenes s
      where s.project_id = _project_id
    ), '[]'::jsonb)
  ) into _snapshot;

  insert into public.project_versions (
    project_id, version_number, label, snapshot
  ) values (
    _project_id,
    _next_version,
    nullif(left(btrim(coalesce(_label, '')), 120), ''),
    _snapshot
  )
  returning * into _created;

  return jsonb_build_object(
    'id', _created.id,
    'version_number', _created.version_number,
    'created_at', _created.created_at,
    'label', _created.label
  );
end;
$$;

revoke all on function public.create_project_version(uuid, text) from public, anon;
grant execute on function public.create_project_version(uuid, text) to authenticated;


create or replace function public.restore_project_version(
  _project_id uuid,
  _version_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  _snapshot jsonb;
  _project_snapshot jsonb;
  _scene jsonb;
  _scene_id uuid;
  _candidate_id uuid;
  _keep_ids uuid[] := array[]::uuid[];
  _ordinal integer;
  _duration numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found or not owned by current user';
  end if;

  select snapshot into _snapshot
  from public.project_versions
  where id = _version_id and project_id = _project_id;

  if not found then
    raise exception 'Project version not found';
  end if;

  if jsonb_typeof(_snapshot -> 'scenes') is distinct from 'array' then
    raise exception 'Project version has an invalid scene snapshot';
  end if;
  if jsonb_array_length(_snapshot -> 'scenes') > 500 then
    raise exception 'Project version contains too many scenes';
  end if;

  _project_snapshot := _snapshot -> 'project';

  update public.projects
  set
    title = coalesce(
      nullif(_project_snapshot ->> 'title', ''),
      nullif(_snapshot ->> 'title', ''),
      title
    ),
    idea = case
      when jsonb_typeof(_project_snapshot) = 'object' and _project_snapshot ? 'idea'
        then nullif(_project_snapshot ->> 'idea', '')
      when _snapshot ? 'idea'
        then nullif(_snapshot ->> 'idea', '')
      else idea
    end,
    format = coalesce(_project_snapshot ->> 'format', format),
    mode = coalesce(_project_snapshot ->> 'mode', mode),
    visual_style = coalesce(_project_snapshot ->> 'visual_style', visual_style),
    settings = case
      when jsonb_typeof(_project_snapshot) = 'object' and _project_snapshot ? 'settings'
        then coalesce(_project_snapshot -> 'settings', '{}'::jsonb)
      else settings
    end,
    updated_at = now()
  where id = _project_id;

  for _scene, _ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(_snapshot -> 'scenes') with ordinality as scene_rows(value, ordinality)
  loop
    if jsonb_typeof(_scene) is distinct from 'object' then
      raise exception 'Project version contains an invalid scene at position %', _ordinal;
    end if;

    if coalesce(_scene ->> 'duration_seconds', '') <> ''
       and (_scene ->> 'duration_seconds') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Project version contains an invalid scene duration at position %', _ordinal;
    end if;

    _duration := greatest(0.1, coalesce(nullif(_scene ->> 'duration_seconds', '')::numeric, 5));

    _scene_id := null;
    if coalesce(_scene ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      _candidate_id := (_scene ->> 'id')::uuid;
      select id into _scene_id
      from public.scenes
      where id = _candidate_id and project_id = _project_id
      for update;
    end if;

    -- Old snapshots lacked scene IDs. Match by target position to preserve
    -- existing scene relations where possible, rather than deleting everything.
    if _scene_id is null then
      select id into _scene_id
      from public.scenes
      where project_id = _project_id and position = _ordinal - 1
      order by created_at, id
      limit 1
      for update;
    end if;

    if _scene_id = any(_keep_ids) then
      _scene_id := null;
    end if;

    if _scene_id is null then
      insert into public.scenes (
        project_id, position, title, narration, visual_prompt, duration_seconds, image_path, clip_path, updated_at
      ) values (
        _project_id,
        _ordinal - 1,
        coalesce(nullif(left(btrim(_scene ->> 'title'), 120), ''), 'Scene ' || _ordinal),
        nullif(_scene ->> 'narration', ''),
        nullif(_scene ->> 'visual_prompt', ''),
        _duration,
        nullif(_scene ->> 'image_path', ''),
        nullif(_scene ->> 'clip_path', ''),
        now()
      )
      returning id into _scene_id;
    else
      update public.scenes
      set
        position = _ordinal - 1,
        title = coalesce(nullif(left(btrim(_scene ->> 'title'), 120), ''), 'Scene ' || _ordinal),
        narration = case when _scene ? 'narration' then nullif(_scene ->> 'narration', '') else narration end,
        visual_prompt = case when _scene ? 'visual_prompt' then nullif(_scene ->> 'visual_prompt', '') else visual_prompt end,
        duration_seconds = _duration,
        image_path = case when _scene ? 'image_path' then nullif(_scene ->> 'image_path', '') else image_path end,
        clip_path = case when _scene ? 'clip_path' then nullif(_scene ->> 'clip_path', '') else clip_path end,
        updated_at = now()
      where id = _scene_id and project_id = _project_id;
    end if;

    _keep_ids := array_append(_keep_ids, _scene_id);
  end loop;

  delete from public.scenes
  where project_id = _project_id
    and not (id = any(_keep_ids));
end;
$$;

revoke all on function public.restore_project_version(uuid, uuid) from public, anon;
grant execute on function public.restore_project_version(uuid, uuid) to authenticated;
