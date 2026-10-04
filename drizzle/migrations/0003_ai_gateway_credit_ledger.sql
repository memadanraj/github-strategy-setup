create table public.ai_tasks (
  slug text primary key,
  name text not null,
  description text,
  model text not null,
  credit_cost integer not null check (credit_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.ai_tasks to anon, authenticated;
grant all on public.ai_tasks to service_role;
alter table public.ai_tasks enable row level security;
create policy "Active tasks are public" on public.ai_tasks for select to anon, authenticated using (is_active);
create policy "Admins manage tasks" on public.ai_tasks for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.ai_tasks (slug,name,description,model,credit_cost) values
('draft_scenes','Draft scenes','Break a video idea into a scene-by-scene outline','openai/gpt-6-astra',10);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_slug text not null references public.ai_tasks(slug),
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  credits_reserved integer not null default 0,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
grant select on public.generation_jobs to authenticated;
grant all on public.generation_jobs to service_role;
alter table public.generation_jobs enable row level security;
create policy "Users read own jobs" on public.generation_jobs for select to authenticated using (auth.uid() = user_id);
create index generation_jobs_user_idx on public.generation_jobs(user_id, created_at desc);
create index generation_jobs_project_idx on public.generation_jobs(project_id, created_at desc);

-- allow ledger functions to change credits past the protection trigger
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.credit_ledger', true) is distinct from 'on'
     and current_setting('request.jwt.claim.role', true) = 'authenticated'
     and not public.has_role(auth.uid(),'admin') then
    new.plan_slug := old.plan_slug;
    new.credits_balance := old.credits_balance;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- reserve credits and open a job (called as the signed-in user)
create or replace function public.start_generation_job(_task_slug text, _project_id uuid, _input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _cost integer;
  _balance integer;
  _job uuid;
begin
  if _uid is null then raise exception 'Not signed in'; end if;
  select credit_cost into _cost from public.ai_tasks where slug = _task_slug and is_active;
  if _cost is null then raise exception 'Unknown AI task'; end if;
  if _project_id is not null and not exists (select 1 from public.projects where id = _project_id and user_id = _uid) then
    raise exception 'Project not found';
  end if;
  select credits_balance into _balance from public.profiles where id = _uid for update;
  if _balance is null or _balance < _cost then raise exception 'INSUFFICIENT_CREDITS'; end if;

  perform set_config('app.credit_ledger','on',true);
  update public.profiles set credits_balance = credits_balance - _cost where id = _uid;
  perform set_config('app.credit_ledger','off',true);

  insert into public.generation_jobs (user_id, project_id, task_slug, status, credits_reserved, input, started_at)
  values (_uid, _project_id, _task_slug, 'running', _cost, coalesce(_input,'{}'::jsonb), now())
  returning id into _job;

  insert into public.credit_transactions (user_id, amount, kind, description)
  values (_uid, -_cost, 'reserve', 'AI job ' || _task_slug);
  return _job;
end $$;

-- mark complete (server only)
create or replace function public.complete_generation_job(_job_id uuid, _output jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.generation_jobs set status = 'complete', output = _output, finished_at = now()
  where id = _job_id and status = 'running';
end $$;

-- mark failed and refund (server only)
create or replace function public.fail_generation_job(_job_id uuid, _error text)
returns void language plpgsql security definer set search_path = public as $$
declare _j public.generation_jobs;
begin
  update public.generation_jobs set status = 'failed', error = left(_error, 500), finished_at = now()
  where id = _job_id and status = 'running' returning * into _j;
  if _j.id is null then return; end if;
  if _j.credits_reserved > 0 then
    perform set_config('app.credit_ledger','on',true);
    update public.profiles set credits_balance = credits_balance + _j.credits_reserved where id = _j.user_id;
    perform set_config('app.credit_ledger','off',true);
    insert into public.credit_transactions (user_id, amount, kind, description)
    values (_j.user_id, _j.credits_reserved, 'refund', 'Refund for failed AI job ' || _j.task_slug);
  end if;
end $$;

revoke execute on function public.start_generation_job(text, uuid, jsonb) from public, anon;
grant execute on function public.start_generation_job(text, uuid, jsonb) to authenticated;
revoke execute on function public.complete_generation_job(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_generation_job(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_generation_job(uuid, jsonb) to service_role;
grant execute on function public.fail_generation_job(uuid, text) to service_role;