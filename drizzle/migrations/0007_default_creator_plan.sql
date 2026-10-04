-- Testing: every user gets the Creator plan and Creator credits by default.
alter table public.profiles alter column plan_slug set default 'creator';
alter table public.profiles alter column credits_balance set default 3500;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _credits integer;
begin
  select monthly_credits into _credits from public.plans where slug = 'creator';
  _credits := coalesce(_credits, 3500);
  insert into public.profiles (id, display_name, avatar_url, plan_slug, credits_balance)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url', 'creator', _credits);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.credit_transactions (user_id, amount, kind, description) values (new.id, _credits, 'grant', 'Creator plan credits (testing)');
  return new;
end $$;

update public.profiles set plan_slug = 'creator', credits_balance = greatest(credits_balance, 3500) where plan_slug <> 'creator';