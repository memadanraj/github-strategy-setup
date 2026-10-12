-- Checked job failure/credit settlement for media persistence paths.
-- Unlike the legacy void RPC, this returns the terminal state so the caller
-- never claims a refund unless the database confirms the transition.
create or replace function public.fail_generation_job_checked(
  _job_id uuid,
  _error text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _job public.generation_jobs%rowtype;
begin
  select * into _job
  from public.generation_jobs
  where id = _job_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if _job.status = 'complete' then
    return 'already_complete';
  end if;

  if _job.status = 'failed' then
    return 'already_failed';
  end if;

  if _job.status not in ('pending', 'running') then
    return 'not_active';
  end if;

  update public.generation_jobs
  set status = 'failed', error = left(coalesce(_error, 'Media generation failed.'), 500), finished_at = now()
  where id = _job_id;

  insert into public.generation_job_events (
    job_id, user_id, event_type, from_status, to_status, metadata
  ) values (
    _job.id, _job.user_id, 'job_failed', _job.status, 'failed',
    jsonb_build_object('task_slug', _job.task_slug, 'settlement_checked', true)
  );

  if _job.credits_reserved > 0 then
    perform set_config('app.credit_ledger', 'on', true);
    update public.profiles
    set credits_balance = credits_balance + _job.credits_reserved
    where id = _job.user_id;

    if not found then
      raise exception 'Profile missing; credit refund could not be applied';
    end if;

    perform set_config('app.credit_ledger', 'off', true);
    insert into public.credit_transactions (user_id, amount, kind, description)
    values (
      _job.user_id,
      _job.credits_reserved,
      'refund',
      'Refund for failed AI job ' || _job.task_slug
    );

    return 'failed_refunded';
  end if;

  return 'failed_without_reservation';
end;
$$;

revoke execute on function public.fail_generation_job_checked(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_generation_job_checked(uuid, text) to service_role;
