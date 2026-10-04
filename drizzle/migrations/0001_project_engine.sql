create or replace function public.owns_project(_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = _project_id and user_id = auth.uid())
$$;

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  label text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);
grant select, insert, delete on public.project_versions to authenticated;
grant all on public.project_versions to service_role;
alter table public.project_versions enable row level security;
create policy "Owners manage versions" on public.project_versions for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null default 0,
  title text not null default 'New scene',
  narration text,
  visual_prompt text,
  duration_seconds numeric not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.scenes to authenticated;
grant all on public.scenes to service_role;
alter table public.scenes enable row level security;
create policy "Owners manage scenes" on public.scenes for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create index scenes_project_idx on public.scenes(project_id, position);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  kind text not null check (kind in ('image','video','audio','voice','music','thumbnail','other')),
  name text not null,
  storage_path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;
alter table public.assets enable row level security;
create policy "Owners manage assets" on public.assets for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create policy "Users read own asset files" on storage.objects for select to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload own asset files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own asset files" on storage.objects for delete to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);