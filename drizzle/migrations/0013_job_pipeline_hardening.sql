-- Phase 3: harden generation job idempotency and preserve lifecycle events.
-- Apply through the project's migration process in staging first.

create table if not exists public.generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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
create policy "Users read own generation job events"
  on public.generation_job_events for select to authenticated
  using (auth.uid() = user_id);

create index if not exists generation_jobs_active_lookup_idx
  on public.generation_jobs(project_id, task_slug, created_at desc)
  where status in ('pending', 'running');
create index if not exists generation_job_events_job_created_idx
  on public.generation_job_events(job_id, created_at);
create index if not exists generation_job_events_user_created_idx
  on public.generation_job_events(user_id, created_at desc);

-- The profile row lock serializes job starts for a user. Checking active clip
-- jobs after taking that lock closes the race between simultaneous start requests.
create or replace function public.start_generation_job(_task_slug text, _project_id uuid, _input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _cost integer;
  _balance integer;
  _job uuid;
  _safe_input jsonb := coalesce(_input, '{}'::jsonb);
begin
  if _uid is null then raise exception 'Not signed in'; end if;

  select credit_cost into _cost
  from public.ai_tasks
  where slug = _task_slug and is_active;
  if _cost is null then raise exception 'Unknown AI task'; end if;

  if _project_id is not null and not exists (
    select 1 from public.projects where id = _project_id and user_id = _uid
  ) then
    raise exception 'Project not found';
  end if;

  select credits_balance into _balance
  from public.profiles
  where id = _uid
  for update;

  if _balance is null then raise exception 'Profile not found'; end if;

  if _task_slug = 'generate_clip'
     and _project_id is not null
     and nullif(_safe_input->>'sceneId', '') is not null
     and exists (
       select 1
       from public.generation_jobs
       where user_id = _uid
         and project_id = _project_id
         and task_slug = _task_slug
         and status in ('pending', 'running')
         and input->>'sceneId' = _safe_input->>'sceneId'
     ) then
    raise exception 'JOB_ALREADY_ACTIVE';
  end if;

  if _balance < _cost then raise exception 'INSUFFICIENT_CREDITS'; end if;

  perform set_config('app.credit_ledger','on',true);
  update public.profiles set credits_balance = credits_balance - _cost where id = _uid;
  perform set_config('app.credit_ledger','off',true);

  insert into public.generation_jobs (user_id, project_id, task_slug, status, credits_reserved, input, started_at)
  values (_uid, _project_id, _task_slug, 'running', _cost, _safe_input, now())
  returning id into _job;

  insert into public.credit_transactions (user_id, amount, kind, description)
  values (_uid, -_cost, 'reserve', 'AI job ' || _task_slug);

  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job, _uid, 'job_started', null, 'running', jsonb_build_object('task_slug', _task_slug));

  return _job;
end $$;

-- Claim the final media-download stage atomically. A second browser tab or poll
-- request must not download/store the same completed clip twice.
create or replace function public.claim_generation_job_download(_job_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _uid uuid;
  _claimed boolean := false;
begin
  update public.generation_jobs
  set output = coalesce(output, '{}'::jsonb) ||
      jsonb_build_object('download_claimed', true, 'download_claimed_at', now())
  where id = _job_id
    and status = 'running'
    and coalesce(output->>'download_claimed', 'false') <> 'true'
  returning user_id into _uid;

  if _uid is null then return false; end if;

  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job_id, _uid, 'media_download_claimed', 'processing', 'downloading', '{}'::jsonb);

  return true;
end $$;

-- Completion and failure are idempotent: only the first terminal transition can
-- settle credits or write a terminal event.
create or replace function public.complete_generation_job(_job_id uuid, _output jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  _job public.generation_jobs;
begin
  update public.generation_jobs
  set status = 'complete', output = coalesce(_output, '{}'::jsonb), finished_at = now()
  where id = _job_id and status in ('pending', 'running')
  returning * into _job;

  if _job.id is null then return; end if;

  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job.id, _job.user_id, 'job_completed', 'running', 'complete',
          jsonb_build_object('task_slug', _job.task_slug));
end $$;

create or replace function public.fail_generation_job(_job_id uuid, _error text)
returns void language plpgsql security definer set search_path = public as $$
declare
  _job public.generation_jobs;
begin
  update public.generation_jobs
  set status = 'failed', error = left(_error, 500), finished_at = now()
  where id = _job_id and status in ('pending', 'running')
  returning * into _job;

  if _job.id is null then return; end if;

  insert into public.generation_job_events (job_id, user_id, event_type, from_status, to_status, metadata)
  values (_job.id, _job.user_id, 'job_failed', 'running', 'failed',
          jsonb_build_object('task_slug', _job.task_slug));

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
