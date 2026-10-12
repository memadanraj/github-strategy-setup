-- Serialize render finalization so overlapping status polls cannot persist
-- duplicate exports for one render job. Do not delete existing export rows during
-- migration: resolve any reported duplicates manually before retrying.
alter table public.render_jobs
  add column if not exists finalization_started_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.exports
    group by render_job_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate exports already exist for a render job. Reconcile these rows before applying the render finalization migration.';
  end if;
end;
$$;

create unique index if not exists exports_render_job_id_unique_idx
  on public.exports(render_job_id);

create or replace function public.claim_render_job_finalization(_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _job public.render_jobs%rowtype;
  _export_id uuid;
begin
  select * into _job
  from public.render_jobs
  where id = _job_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select id into _export_id
  from public.exports
  where render_job_id = _job_id
  limit 1;

  if _export_id is not null then
    update public.render_jobs
    set status = 'completed',
        progress = 100,
        error = null,
        finalization_started_at = null,
        finished_at = coalesce(finished_at, now()),
        updated_at = now()
    where id = _job_id;
    return 'already_complete';
  end if;

  if _job.status in ('failed', 'cancelled') then
    return 'not_active';
  end if;

  if _job.finalization_started_at is not null
     and _job.finalization_started_at > now() - interval '5 minutes' then
    return 'busy';
  end if;

  update public.render_jobs
  set status = 'processing',
      finalization_started_at = now(),
      updated_at = now()
  where id = _job_id
    and status in ('queued', 'processing', 'completed');

  if not found then
    return 'not_active';
  end if;

  return 'claimed';
end;
$$;

revoke all on function public.claim_render_job_finalization(uuid) from public, anon, authenticated;
grant execute on function public.claim_render_job_finalization(uuid) to service_role;
