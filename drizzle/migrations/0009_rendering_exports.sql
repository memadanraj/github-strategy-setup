-- Phase 10: Rendering + Cloud Export
create table public.render_presets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  width integer not null check (width between 320 and 7680),
  height integer not null check (height between 320 and 7680),
  fps integer not null check (fps in (24,25,30,50,60)),
  video_codec text not null default 'h264',
  audio_codec text not null default 'aac',
  video_bitrate_kbps integer not null default 8000 check (video_bitrate_kbps between 500 and 100000),
  audio_bitrate_kbps integer not null default 192 check (audio_bitrate_kbps between 32 and 1024),
  container text not null default 'mp4' check (container in ('mp4','webm')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.render_presets to authenticated;
grant all on public.render_presets to service_role;
alter table public.render_presets enable row level security;
create policy "Users manage own render presets" on public.render_presets for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preset_id uuid references public.render_presets(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  provider text not null default 'cloud',
  provider_job_id text,
  progress numeric not null default 0 check (progress between 0 and 100),
  input_manifest jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update on public.render_jobs to authenticated;
grant all on public.render_jobs to service_role;
alter table public.render_jobs enable row level security;
create policy "Users read own render jobs" on public.render_jobs for select to authenticated using (auth.uid()=user_id);
create policy "Users create own render jobs" on public.render_jobs for insert to authenticated with check (auth.uid()=user_id and public.owns_project(project_id));
create index render_jobs_project_idx on public.render_jobs(project_id, created_at desc);
create index render_jobs_status_idx on public.render_jobs(status, created_at);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  render_job_id uuid not null references public.render_jobs(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  format text not null,
  storage_path text,
  filename text not null,
  size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  fps integer,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select,insert,update on public.exports to authenticated;
grant all on public.exports to service_role;
alter table public.exports enable row level security;
create policy "Users read own exports" on public.exports for select to authenticated using (public.owns_project(project_id));
create index exports_project_idx on public.exports(project_id, created_at desc);

insert into public.ai_tasks(slug,name,description,model,credit_cost,is_active) values
('render_video','Video render','Render the project timeline to an export','cloud-renderer',0,true)
on conflict(slug) do update set name=excluded.name,description=excluded.description,model=excluded.model,credit_cost=excluded.credit_cost,is_active=excluded.is_active;
