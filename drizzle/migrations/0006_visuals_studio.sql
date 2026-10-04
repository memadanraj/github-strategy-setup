alter table public.projects add column visual_style text not null default 'cinematic';

alter table public.scenes add column image_path text;
alter table public.scenes add column clip_path text;

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  visual_notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.characters to authenticated;
grant all on public.characters to service_role;
alter table public.characters enable row level security;
create policy "Users manage characters of own projects" on public.characters for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));