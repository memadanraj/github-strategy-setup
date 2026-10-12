-- Rebuild scene-derived timeline clips and narration captions atomically.
-- Lock the project to serialize editor rebuilds with other cooperating writers.
create or replace function public.rebuild_project_timeline(_project_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  _project public.projects%rowtype;
  _video_track uuid;
  _audio_track uuid;
  _caption_track uuid;
  _next_position integer;
  _scene record;
  _cursor numeric := 0;
  _duration numeric;
  _clip_count integer := 0;
  _tracks_created integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _project from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;

  if not exists(select 1 from public.scenes where project_id = _project_id) then
    raise exception 'Add scenes before building the timeline';
  end if;

  select id into _video_track from public.timeline_tracks
  where project_id = _project_id and track_type = 'video'
  order by position, created_at, id limit 1 for update;
  if _video_track is null then
    select coalesce(max(position), -1) + 1 into _next_position
    from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position)
    values (_project_id, 'Video', 'video', _next_position)
    returning id into _video_track;
    _tracks_created := _tracks_created + 1;
  end if;

  select id into _audio_track from public.timeline_tracks
  where project_id = _project_id and track_type = 'audio'
  order by position, created_at, id limit 1 for update;
  if _audio_track is null then
    select coalesce(max(position), -1) + 1 into _next_position
    from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position)
    values (_project_id, 'Audio', 'audio', _next_position)
    returning id into _audio_track;
    _tracks_created := _tracks_created + 1;
  end if;

  select id into _caption_track from public.timeline_tracks
  where project_id = _project_id and track_type = 'caption'
  order by position, created_at, id limit 1 for update;
  if _caption_track is null then
    select coalesce(max(position), -1) + 1 into _next_position
    from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position)
    values (_project_id, 'Captions', 'caption', _next_position)
    returning id into _caption_track;
    _tracks_created := _tracks_created + 1;
  end if;

  -- All following deletes/inserts and settings updates commit or roll back together.
  delete from public.timeline_clips where project_id = _project_id;

  for _scene in
    select id, title, duration_seconds, image_path, clip_path
    from public.scenes
    where project_id = _project_id
    order by position, created_at, id
  loop
    _duration := case
      when _scene.duration_seconds > 0 and _scene.duration_seconds < 3600
        then _scene.duration_seconds
      else 5
    end;

    insert into public.timeline_clips(
      project_id, track_id, scene_id, clip_type, start_seconds, duration_seconds, metadata
    ) values (
      _project_id,
      _video_track,
      _scene.id,
      case when nullif(_scene.clip_path, '') is not null then 'video' else 'image' end,
      _cursor,
      _duration,
      jsonb_build_object('source', coalesce(nullif(_scene.clip_path, ''), nullif(_scene.image_path, '')))
    );
    _cursor := _cursor + _duration;
    _clip_count := _clip_count + 1;
  end loop;

  insert into public.timeline_settings(project_id, width, height, updated_at)
  values (
    _project_id,
    case when _project.format = 'short' then 1080 else 1920 end,
    case when _project.format = 'short' then 1920 else 1080 end,
    now()
  )
  on conflict (project_id) do update
  set width = excluded.width, height = excluded.height, updated_at = now();

  return jsonb_build_object(
    'clips_created', _clip_count,
    'tracks_created', _tracks_created,
    'width', case when _project.format = 'short' then 1080 else 1920 end,
    'height', case when _project.format = 'short' then 1920 else 1080 end
  );
end;
$$;

create or replace function public.regenerate_project_captions(_project_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  _scene record;
  _words text[];
  _word_count integer;
  _chunk_count integer;
  _chunk_index integer;
  _text text;
  _duration numeric;
  _cursor numeric := 0;
  _cue_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  perform 1 from public.projects
  where id = _project_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;

  if not exists(select 1 from public.scenes where project_id = _project_id) then
    raise exception 'Add scenes before generating captions';
  end if;

  delete from public.captions where project_id = _project_id;

  for _scene in
    select id, narration, duration_seconds
    from public.scenes
    where project_id = _project_id
    order by position, created_at, id
  loop
    _duration := case
      when _scene.duration_seconds > 0 and _scene.duration_seconds < 3600
        then _scene.duration_seconds
      else 5
    end;

    if nullif(btrim(coalesce(_scene.narration, '')), '') is not null then
      _words := regexp_split_to_array(btrim(_scene.narration), '[[:space:]]+');
      _word_count := coalesce(array_length(_words, 1), 0);
      _chunk_count := ceil(_word_count / 5.0)::integer;

      for _chunk_index in 0..(_chunk_count - 1) loop
        _text := array_to_string(
          _words[(_chunk_index * 5 + 1):least((_chunk_index + 1) * 5, _word_count)],
          ' '
        );

        insert into public.captions(
          project_id, scene_id, text, start_seconds, end_seconds, position
        ) values (
          _project_id,
          _scene.id,
          _text,
          _cursor + (_duration * _chunk_index / _chunk_count),
          _cursor + (_duration * (_chunk_index + 1) / _chunk_count),
          'bottom'
        );
        _cue_count := _cue_count + 1;
      end loop;
    end if;
    _cursor := _cursor + _duration;
  end loop;

  return jsonb_build_object('cues_created', _cue_count);
end;
$$;

revoke all on function public.rebuild_project_timeline(uuid) from public, anon;
grant execute on function public.rebuild_project_timeline(uuid) to authenticated;
revoke all on function public.regenerate_project_captions(uuid) from public, anon;
grant execute on function public.regenerate_project_captions(uuid) to authenticated;
