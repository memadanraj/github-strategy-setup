-- Persist the creation wizard's production brief and plan on each project.
alter table public.projects
  add column if not exists settings jsonb not null default '{}'::jsonb;
