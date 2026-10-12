create table if not exists public.generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  user_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.generation_job_events to authenticated;
grant all on public.generation_job_events to service_role;
alter table public.generation_job_events enable row level security;
drop policy if exists "Users read own generation job events" on public.generation_job_events;
create policy "Users read own generation job events" on public.generation_job_events for select to authenticated using (auth.uid() = user_id);
create index if not exists generation_jobs_active_lookup_idx on public.generation_jobs(project_id, task_slug, created_at desc) where status in ('pending', 'running');
create index if not exists generation_job_events_job_created_idx on public.generation_job_events(job_id, created_at);
create index if not exists generation_job_events_user_created_idx on public.generation_job_events(user_id, created_at desc);

create or replace function public.start_generation_job(_task_slug text, _project_id uuid, _input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid(); _cost integer; _balance integer; _job uuid;
  _safe_input jsonb := coalesce(_input, '{}'::jsonb);
begin
  if _uid is null then raise exception 'Not signed in'; end if;
  select credit_cost into _cost from public.ai_tasks where slug = _task_slug and is_active;
  if _cost is null then raise exception 'Unknown AI task'; end if;
  if _project_id is not null and not exists (select 1 from public.projects where id = _project_id and user_id = _uid) then
    raise exception 'Project not found';
  end if;
  select credits_balance into _balance from public.profiles where id = _uid for update;
  if _balance is null then raise exception 'Profile not found'; end if;
  if _task_slug = 'generate_clip' and _project_id is not null and nullif(_safe_input->>'sceneId', '') is not null
     and exists (select 1 from public.generation_jobs where user_id = _uid and project_id = _project_id and task_slug = _task_slug
       and status in ('pending', 'running') and input->>'sceneId' = _safe_input->>'sceneId') then
    raise exception 'JOB_ALREADY_ACTIVE';
  end if;
  if _balance < _cost then raise exception 'INSUFFICIENT_CREDITS'; end if;
  perform set_config('app.credit_ledger','on',true);
  update public.profiles set credits_balance = credits_balance - _cost where id = _uid;
  perform set_config('app.credit_ledger','off',true);
  insert into public.generation_jobs (user_id, project_id, task_slug, status, credits_reserved, input, started_at)
  values (_uid, _project_id, _task_slug, 'running', _cost, _safe_input, now()) returning id into _job;
  insert into public.credit_transactions (user_id, amount, kind, description) values (_uid, -_cost, 'reserve', 'AI job ' || _task_slug);
  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job, _uid, 'job_started', null, 'running', jsonb_build_object('task_slug', _task_slug));
  return _job;
end $$;

create or replace function public.claim_generation_job_download(_job_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  update public.generation_jobs
  set output = coalesce(output, '{}'::jsonb) || jsonb_build_object('download_claimed', true, 'download_claimed_at', now())
  where id = _job_id and status = 'running' and coalesce(output->>'download_claimed', 'false') <> 'true'
  returning user_id into _uid;
  if _uid is null then return false; end if;
  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job_id, _uid, 'media_download_claimed', 'processing', 'downloading', '{}'::jsonb);
  return true;
end $$;

create or replace function public.complete_generation_job(_job_id uuid, _output jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _job public.generation_jobs;
begin
  update public.generation_jobs set status = 'complete', output = coalesce(_output, '{}'::jsonb), finished_at = now()
  where id = _job_id and status in ('pending', 'running') returning * into _job;
  if _job.id is null then return; end if;
  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job.id, _job.user_id, 'job_completed', 'running', 'complete', jsonb_build_object('task_slug', _job.task_slug));
end $$;

create or replace function public.fail_generation_job(_job_id uuid, _error text)
returns void language plpgsql security definer set search_path = public as $$
declare _job public.generation_jobs;
begin
  update public.generation_jobs set status = 'failed', error = left(_error, 500), finished_at = now()
  where id = _job_id and status in ('pending', 'running') returning * into _job;
  if _job.id is null then return; end if;
  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job.id, _job.user_id, 'job_failed', 'running', 'failed', jsonb_build_object('task_slug', _job.task_slug));
  if _job.credits_reserved > 0 then
    perform set_config('app.credit_ledger','on',true);
    update public.profiles set credits_balance = credits_balance + _job.credits_reserved where id = _job.user_id;
    perform set_config('app.credit_ledger','off',true);
    insert into public.credit_transactions (user_id, amount, kind, description)
    values (_job.user_id, _job.credits_reserved, 'refund', 'Refund for failed AI job ' || _job.task_slug);
  end if;
end $$;

revoke execute on function public.claim_generation_job_download(uuid) from public, anon, authenticated;
grant execute on function public.claim_generation_job_download(uuid) to service_role;
revoke execute on function public.start_generation_job(text, uuid, jsonb) from public, anon;
grant execute on function public.start_generation_job(text, uuid, jsonb) to authenticated;
revoke execute on function public.complete_generation_job(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_generation_job(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_generation_job(uuid, jsonb) to service_role;
grant execute on function public.fail_generation_job(uuid, text) to service_role;

alter table public.credit_transactions add column if not exists idempotency_key text;
alter table public.paddle_events add column if not exists processing_status text not null default 'processed';
alter table public.paddle_events add column if not exists processing_started_at timestamptz;
alter table public.paddle_events add column if not exists last_error text;
create index if not exists paddle_events_processing_idx on public.paddle_events(processing_status, processing_started_at);
create unique index if not exists credit_transactions_idempotency_key_uq on public.credit_transactions(idempotency_key) where idempotency_key is not null;

create table if not exists public.paddle_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_kind text not null check (item_kind in ('subscription', 'credit_pack')),
  item_slug text not null,
  paddle_price_id text not null,
  fulfilled_transaction_id text unique,
  fulfilled_subscription_id text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now()
);
create index if not exists paddle_checkout_intents_user_created_idx on public.paddle_checkout_intents(user_id, created_at desc);
create index if not exists paddle_checkout_intents_expiry_idx on public.paddle_checkout_intents(expires_at);
grant all on public.paddle_checkout_intents to service_role;
revoke all on public.paddle_checkout_intents from anon, authenticated;
alter table public.paddle_checkout_intents enable row level security;

create or replace function public.apply_credit_transaction(_user_id uuid, _amount integer, _kind text, _description text, _idempotency_key text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare _current_balance integer; _next_balance integer; _applied_amount integer; _transaction_id uuid;
begin
  if _user_id is null then raise exception 'User is required'; end if;
  if _amount = 0 then raise exception 'Credit transaction amount cannot be zero'; end if;
  if _amount < -1000000 or _amount > 1000000 then raise exception 'Credit amount is out of range'; end if;
  if _kind is null or btrim(_kind) = '' then raise exception 'Credit transaction kind is required'; end if;
  if _idempotency_key is not null and length(_idempotency_key) > 200 then raise exception 'Idempotency key is too long'; end if;
  select credits_balance into _current_balance from public.profiles where id = _user_id for update;
  if _current_balance is null then raise exception 'Profile not found'; end if;
  _next_balance := greatest(0, _current_balance + _amount);
  _applied_amount := _next_balance - _current_balance;
  if _idempotency_key is not null and btrim(_idempotency_key) <> '' then
    insert into public.credit_transactions(user_id, amount, kind, description, idempotency_key)
    values (_user_id, _applied_amount, _kind, left(_description, 500), _idempotency_key)
    on conflict (idempotency_key) where idempotency_key is not null do nothing returning id into _transaction_id;
    if _transaction_id is null then return _current_balance; end if;
  else
    insert into public.credit_transactions(user_id, amount, kind, description)
    values (_user_id, _applied_amount, _kind, left(_description, 500)) returning id into _transaction_id;
  end if;
  if _applied_amount <> 0 then
    perform set_config('app.credit_ledger', 'on', true);
    update public.profiles set credits_balance = _next_balance, updated_at = now() where id = _user_id;
    perform set_config('app.credit_ledger', 'off', true);
  end if;
  return _next_balance;
end $$;
revoke all on function public.apply_credit_transaction(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_credit_transaction(uuid, integer, text, text, text) to service_role;

create or replace function public.replace_project_scenes(_project_id uuid, _scenes jsonb)
returns integer language plpgsql set search_path = public as $$
declare _count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _project_id is null then raise exception 'Project is required'; end if;
  if jsonb_typeof(_scenes) is distinct from 'array' then raise exception 'Scene list must be a JSON array'; end if;
  if jsonb_array_length(_scenes) < 1 or jsonb_array_length(_scenes) > 60 then raise exception 'Scene list must contain between 1 and 60 scenes'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  delete from public.scenes where project_id = _project_id;
  insert into public.scenes (project_id, position, title, narration, visual_prompt, duration_seconds)
  select _project_id, (item.ordinality - 1)::integer,
    coalesce(nullif(left(btrim(item.value->>'title'), 120), ''), 'Scene ' || item.ordinality),
    nullif(btrim(item.value->>'narration'), ''),
    nullif(btrim(item.value->>'visual_prompt'), ''),
    greatest(1, least(120, round(coalesce(nullif(item.value->>'duration_seconds', '')::numeric, 5))))
  from jsonb_array_elements(_scenes) with ordinality as item(value, ordinality);
  get diagnostics _count = row_count;
  return _count;
end; $$;
revoke all on function public.replace_project_scenes(uuid, jsonb) from public, anon;
grant execute on function public.replace_project_scenes(uuid, jsonb) to authenticated;

alter table public.projects add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.create_project_version(_project_id uuid, _label text default null)
returns jsonb language plpgsql set search_path = public as $$
declare _project public.projects%rowtype; _next_version integer; _snapshot jsonb; _created public.project_versions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _project from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  select coalesce(max(version_number), 0) + 1 into _next_version from public.project_versions where project_id = _project_id;
  select jsonb_build_object(
    'schema_version', 2, 'title', _project.title, 'idea', _project.idea,
    'project', jsonb_build_object('title', _project.title, 'idea', _project.idea, 'format', _project.format,
      'mode', _project.mode, 'visual_style', _project.visual_style, 'settings', _project.settings),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position, 'title', s.title,
        'narration', s.narration, 'visual_prompt', s.visual_prompt, 'duration_seconds', s.duration_seconds,
        'image_path', s.image_path, 'clip_path', s.clip_path) order by s.position, s.created_at)
      from public.scenes s where s.project_id = _project_id), '[]'::jsonb)
  ) into _snapshot;
  insert into public.project_versions (project_id, version_number, label, snapshot)
  values (_project_id, _next_version, nullif(left(btrim(coalesce(_label, '')), 120), ''), _snapshot)
  returning * into _created;
  return jsonb_build_object('id', _created.id, 'version_number', _created.version_number, 'created_at', _created.created_at, 'label', _created.label);
end; $$;
revoke all on function public.create_project_version(uuid, text) from public, anon;
grant execute on function public.create_project_version(uuid, text) to authenticated;

create or replace function public.restore_project_version(_project_id uuid, _version_id uuid)
returns void language plpgsql set search_path = public as $$
declare _snapshot jsonb; _project_snapshot jsonb; _scene jsonb; _scene_id uuid; _candidate_id uuid;
  _keep_ids uuid[] := array[]::uuid[]; _ordinal integer; _duration numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  select snapshot into _snapshot from public.project_versions where id = _version_id and project_id = _project_id;
  if not found then raise exception 'Project version not found'; end if;
  if jsonb_typeof(_snapshot -> 'scenes') is distinct from 'array' then raise exception 'Project version has an invalid scene snapshot'; end if;
  if jsonb_array_length(_snapshot -> 'scenes') > 500 then raise exception 'Project version contains too many scenes'; end if;
  _project_snapshot := _snapshot -> 'project';
  update public.projects set
    title = coalesce(nullif(_project_snapshot ->> 'title', ''), nullif(_snapshot ->> 'title', ''), title),
    idea = case when jsonb_typeof(_project_snapshot) = 'object' and _project_snapshot ? 'idea' then nullif(_project_snapshot ->> 'idea', '')
      when _snapshot ? 'idea' then nullif(_snapshot ->> 'idea', '') else idea end,
    format = coalesce(_project_snapshot ->> 'format', format),
    mode = coalesce(_project_snapshot ->> 'mode', mode),
    visual_style = coalesce(_project_snapshot ->> 'visual_style', visual_style),
    settings = case when jsonb_typeof(_project_snapshot) = 'object' and _project_snapshot ? 'settings'
      then coalesce(_project_snapshot -> 'settings', '{}'::jsonb) else settings end,
    updated_at = now()
  where id = _project_id;
  for _scene, _ordinal in select value, ordinality::integer from jsonb_array_elements(_snapshot -> 'scenes') with ordinality as scene_rows(value, ordinality)
  loop
    if jsonb_typeof(_scene) is distinct from 'object' then raise exception 'Project version contains an invalid scene at position %', _ordinal; end if;
    if coalesce(_scene ->> 'duration_seconds', '') <> '' and (_scene ->> 'duration_seconds') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Project version contains an invalid scene duration at position %', _ordinal;
    end if;
    _duration := greatest(0.1, coalesce(nullif(_scene ->> 'duration_seconds', '')::numeric, 5));
    _scene_id := null;
    if coalesce(_scene ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      _candidate_id := (_scene ->> 'id')::uuid;
      select id into _scene_id from public.scenes where id = _candidate_id and project_id = _project_id for update;
    end if;
    if _scene_id is null then
      select id into _scene_id from public.scenes where project_id = _project_id and position = _ordinal - 1 order by created_at, id limit 1 for update;
    end if;
    if _scene_id = any(_keep_ids) then _scene_id := null; end if;
    if _scene_id is null then
      insert into public.scenes (project_id, position, title, narration, visual_prompt, duration_seconds, image_path, clip_path, updated_at)
      values (_project_id, _ordinal - 1, coalesce(nullif(left(btrim(_scene ->> 'title'), 120), ''), 'Scene ' || _ordinal),
        nullif(_scene ->> 'narration', ''), nullif(_scene ->> 'visual_prompt', ''), _duration,
        nullif(_scene ->> 'image_path', ''), nullif(_scene ->> 'clip_path', ''), now())
      returning id into _scene_id;
    else
      update public.scenes set position = _ordinal - 1,
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
  delete from public.scenes where project_id = _project_id and not (id = any(_keep_ids));
end; $$;
revoke all on function public.restore_project_version(uuid, uuid) from public, anon;
grant execute on function public.restore_project_version(uuid, uuid) to authenticated;

create table if not exists public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  export_id uuid not null references public.exports(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  password_salt text,
  password_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  failed_password_attempts integer not null default 0 check (failed_password_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  check ((password_salt is null) = (password_hash is null))
);
create index if not exists project_share_links_project_created_idx on public.project_share_links(project_id, created_at desc);
create index if not exists project_share_links_export_idx on public.project_share_links(export_id);
revoke all on table public.project_share_links from public, anon, authenticated;
grant all on table public.project_share_links to service_role;
alter table public.project_share_links enable row level security;

create or replace function public.record_project_share_password_failure(_share_id uuid)
returns table(failed_attempts integer, locked_until timestamptz) language plpgsql set search_path = public as $$
begin
  return query
  update public.project_share_links as links set
    failed_password_attempts = links.failed_password_attempts + 1,
    locked_until = case when links.failed_password_attempts + 1 >= 5 then now() + interval '15 minutes' else links.locked_until end
  where links.id = _share_id and links.revoked_at is null
  returning links.failed_password_attempts, links.locked_until;
end; $$;
revoke all on function public.record_project_share_password_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_project_share_password_failure(uuid) to service_role;

create or replace function public.move_project_scene(_project_id uuid, _scene_id uuid, _direction integer)
returns boolean language plpgsql set search_path = public as $$
declare _ordered_ids uuid[]; _current_index integer; _target_index integer; _temp_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _direction not in (-1, 1) then raise exception 'Invalid scene movement direction'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  select array_agg(id order by position, created_at, id) into _ordered_ids from public.scenes where project_id = _project_id;
  if _ordered_ids is null then return false; end if;
  _current_index := array_position(_ordered_ids, _scene_id);
  if _current_index is null then return false; end if;
  _target_index := _current_index + _direction;
  if _target_index < 1 or _target_index > cardinality(_ordered_ids) then return false; end if;
  _temp_id := _ordered_ids[_current_index];
  _ordered_ids[_current_index] := _ordered_ids[_target_index];
  _ordered_ids[_target_index] := _temp_id;
  with desired as (select scene_id, ordinal::integer - 1 as new_position from unnest(_ordered_ids) with ordinality as ids(scene_id, ordinal))
  update public.scenes as scenes set position = desired.new_position, updated_at = now()
  from desired where scenes.id = desired.scene_id and scenes.project_id = _project_id;
  return true;
end; $$;
revoke all on function public.move_project_scene(uuid, uuid, integer) from public, anon;
grant execute on function public.move_project_scene(uuid, uuid, integer) to authenticated;

create or replace function public.create_project_scene(_project_id uuid, _title text)
returns uuid language plpgsql set search_path = public as $$
declare _next_position integer; _scene_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  select coalesce(max(position), -1) + 1 into _next_position from public.scenes where project_id = _project_id;
  insert into public.scenes(project_id, position, title)
  values (_project_id, _next_position, coalesce(nullif(left(btrim(_title), 120), ''), 'New scene')) returning id into _scene_id;
  return _scene_id;
end; $$;

create or replace function public.delete_project_scene(_project_id uuid, _scene_id uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  delete from public.scenes where id = _scene_id and project_id = _project_id;
  if not found then return false; end if;
  with desired as (select id, row_number() over (order by position, created_at, id)::integer - 1 as new_position from public.scenes where project_id = _project_id)
  update public.scenes as scenes set position = desired.new_position, updated_at = now() from desired where scenes.id = desired.id;
  return true;
end; $$;
revoke all on function public.create_project_scene(uuid, text) from public, anon;
grant execute on function public.create_project_scene(uuid, text) to authenticated;
revoke all on function public.delete_project_scene(uuid, uuid) from public, anon;
grant execute on function public.delete_project_scene(uuid, uuid) to authenticated;

create or replace function public.fail_generation_job_checked(_job_id uuid, _error text)
returns text language plpgsql security definer set search_path = public as $$
declare _job public.generation_jobs%rowtype;
begin
  select * into _job from public.generation_jobs where id = _job_id for update;
  if not found then return 'not_found'; end if;
  if _job.status = 'complete' then return 'already_complete'; end if;
  if _job.status = 'failed' then return 'already_failed'; end if;
  if _job.status not in ('pending', 'running') then return 'not_active'; end if;
  update public.generation_jobs set status = 'failed', error = left(coalesce(_error, 'Media generation failed.'), 500), finished_at = now() where id = _job_id;
  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job.id, _job.user_id, 'job_failed', _job.status, 'failed', jsonb_build_object('task_slug', _job.task_slug, 'settlement_checked', true));
  if _job.credits_reserved > 0 then
    perform set_config('app.credit_ledger', 'on', true);
    update public.profiles set credits_balance = credits_balance + _job.credits_reserved where id = _job.user_id;
    if not found then raise exception 'Profile missing; credit refund could not be applied'; end if;
    perform set_config('app.credit_ledger', 'off', true);
    insert into public.credit_transactions (user_id, amount, kind, description)
    values (_job.user_id, _job.credits_reserved, 'refund', 'Refund for failed AI job ' || _job.task_slug);
    return 'failed_refunded';
  end if;
  return 'failed_without_reservation';
end; $$;
revoke execute on function public.fail_generation_job_checked(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_generation_job_checked(uuid, text) to service_role;

alter table public.render_jobs add column if not exists finalization_started_at timestamptz;
create unique index if not exists exports_render_job_id_unique_idx on public.exports(render_job_id);

create or replace function public.claim_render_job_finalization(_job_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare _job public.render_jobs%rowtype; _export_id uuid;
begin
  select * into _job from public.render_jobs where id = _job_id for update;
  if not found then return 'not_found'; end if;
  select id into _export_id from public.exports where render_job_id = _job_id limit 1;
  if _export_id is not null then
    update public.render_jobs set status = 'completed', progress = 100, error = null, finalization_started_at = null,
      finished_at = coalesce(finished_at, now()), updated_at = now() where id = _job_id;
    return 'already_complete';
  end if;
  if _job.status in ('failed', 'cancelled') then return 'not_active'; end if;
  if _job.finalization_started_at is not null and _job.finalization_started_at > now() - interval '5 minutes' then return 'busy'; end if;
  update public.render_jobs set status = 'processing', finalization_started_at = now(), updated_at = now()
  where id = _job_id and status in ('queued', 'processing', 'completed');
  if not found then return 'not_active'; end if;
  return 'claimed';
end; $$;
revoke all on function public.claim_render_job_finalization(uuid) from public, anon, authenticated;
grant execute on function public.claim_render_job_finalization(uuid) to service_role;

create or replace function public.rebuild_project_timeline(_project_id uuid)
returns jsonb language plpgsql set search_path = public as $$
declare _project public.projects%rowtype; _video_track uuid; _audio_track uuid; _caption_track uuid; _next_position integer;
  _scene record; _cursor numeric := 0; _duration numeric; _clip_count integer := 0; _tracks_created integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _project from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  if not exists(select 1 from public.scenes where project_id = _project_id) then raise exception 'Add scenes before building the timeline'; end if;
  select id into _video_track from public.timeline_tracks where project_id = _project_id and track_type = 'video' order by position, created_at, id limit 1 for update;
  if _video_track is null then
    select coalesce(max(position), -1) + 1 into _next_position from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position) values (_project_id, 'Video', 'video', _next_position) returning id into _video_track;
    _tracks_created := _tracks_created + 1;
  end if;
  select id into _audio_track from public.timeline_tracks where project_id = _project_id and track_type = 'audio' order by position, created_at, id limit 1 for update;
  if _audio_track is null then
    select coalesce(max(position), -1) + 1 into _next_position from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position) values (_project_id, 'Audio', 'audio', _next_position) returning id into _audio_track;
    _tracks_created := _tracks_created + 1;
  end if;
  select id into _caption_track from public.timeline_tracks where project_id = _project_id and track_type = 'caption' order by position, created_at, id limit 1 for update;
  if _caption_track is null then
    select coalesce(max(position), -1) + 1 into _next_position from public.timeline_tracks where project_id = _project_id;
    insert into public.timeline_tracks(project_id, name, track_type, position) values (_project_id, 'Captions', 'caption', _next_position) returning id into _caption_track;
    _tracks_created := _tracks_created + 1;
  end if;
  delete from public.timeline_clips where project_id = _project_id;
  for _scene in select id, title, duration_seconds, image_path, clip_path from public.scenes where project_id = _project_id order by position, created_at, id
  loop
    _duration := case when _scene.duration_seconds > 0 and _scene.duration_seconds < 3600 then _scene.duration_seconds else 5 end;
    insert into public.timeline_clips(project_id, track_id, scene_id, clip_type, start_seconds, duration_seconds, metadata)
    values (_project_id, _video_track, _scene.id, case when nullif(_scene.clip_path, '') is not null then 'video' else 'image' end,
      _cursor, _duration, jsonb_build_object('source', coalesce(nullif(_scene.clip_path, ''), nullif(_scene.image_path, ''))));
    _cursor := _cursor + _duration;
    _clip_count := _clip_count + 1;
  end loop;
  insert into public.timeline_settings(project_id, width, height, updated_at)
  values (_project_id, case when _project.format = 'short' then 1080 else 1920 end, case when _project.format = 'short' then 1920 else 1080 end, now())
  on conflict (project_id) do update set width = excluded.width, height = excluded.height, updated_at = now();
  return jsonb_build_object('clips_created', _clip_count, 'tracks_created', _tracks_created,
    'width', case when _project.format = 'short' then 1080 else 1920 end, 'height', case when _project.format = 'short' then 1920 else 1080 end);
end; $$;

create or replace function public.regenerate_project_captions(_project_id uuid)
returns jsonb language plpgsql set search_path = public as $$
declare _scene record; _words text[]; _word_count integer; _chunk_count integer; _chunk_index integer; _text text;
  _duration numeric; _cursor numeric := 0; _cue_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.projects where id = _project_id and user_id = auth.uid() for update;
  if not found then raise exception 'Project not found or not owned by current user'; end if;
  if not exists(select 1 from public.scenes where project_id = _project_id) then raise exception 'Add scenes before generating captions'; end if;
  delete from public.captions where project_id = _project_id;
  for _scene in select id, narration, duration_seconds from public.scenes where project_id = _project_id order by position, created_at, id
  loop
    _duration := case when _scene.duration_seconds > 0 and _scene.duration_seconds < 3600 then _scene.duration_seconds else 5 end;
    if nullif(btrim(coalesce(_scene.narration, '')), '') is not null then
      _words := regexp_split_to_array(btrim(_scene.narration), '[[:space:]]+');
      _word_count := coalesce(array_length(_words, 1), 0);
      _chunk_count := ceil(_word_count / 5.0)::integer;
      for _chunk_index in 0..(_chunk_count - 1) loop
        _text := array_to_string(_words[(_chunk_index * 5 + 1):least((_chunk_index + 1) * 5, _word_count)], ' ');
        insert into public.captions(project_id, scene_id, text, start_seconds, end_seconds, position)
        values (_project_id, _scene.id, _text, _cursor + (_duration * _chunk_index / _chunk_count), _cursor + (_duration * (_chunk_index + 1) / _chunk_count), 'bottom');
        _cue_count := _cue_count + 1;
      end loop;
    end if;
    _cursor := _cursor + _duration;
  end loop;
  return jsonb_build_object('cues_created', _cue_count);
end; $$;
revoke all on function public.rebuild_project_timeline(uuid) from public, anon;
grant execute on function public.rebuild_project_timeline(uuid) to authenticated;
revoke all on function public.regenerate_project_captions(uuid) from public, anon;
grant execute on function public.regenerate_project_captions(uuid) to authenticated;