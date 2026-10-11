create table public.project_share_links (
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

create index project_share_links_project_created_idx
  on public.project_share_links(project_id, created_at desc);
create index project_share_links_export_idx on public.project_share_links(export_id);

alter table public.project_share_links enable row level security;
revoke all on table public.project_share_links from public, anon, authenticated;
grant all on table public.project_share_links to service_role;

create or replace function public.record_project_share_password_failure(_share_id uuid)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql
set search_path = public
as $$
begin
  return query
  update public.project_share_links as links
  set
    failed_password_attempts = links.failed_password_attempts + 1,
    locked_until = case
      when links.failed_password_attempts + 1 >= 5 then now() + interval '15 minutes'
      else links.locked_until
    end
  where links.id = _share_id and links.revoked_at is null
  returning links.failed_password_attempts, links.locked_until;
end;
$$;
revoke all on function public.record_project_share_password_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_project_share_password_failure(uuid) to service_role;
