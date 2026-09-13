begin;

alter table public.pie_overage_ledger
  add column if not exists external_cost_budget_cents integer not null default 0;

do $$ begin
  alter table public.pie_overage_ledger
    add constraint pie_overage_ledger_external_cost_budget_cents_check
    check (external_cost_budget_cents >= 0 and external_cost_budget_cents <= 100000);
exception when duplicate_object then null;
end $$;

drop function if exists public.pie_grant_overage_credits(text, integer, text);

create function public.pie_grant_overage_credits(
  p_user_id text,
  p_credits integer,
  p_stripe_session_id text,
  p_external_cost_budget_cents integer default 0
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_period date := public.pie_billing_period_start(p_user_id);
  v_existing public.pie_overage_ledger%rowtype;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then raise exception 'user_id required'; end if;
  if p_credits < 1 or p_credits > 10000 then raise exception 'invalid credits'; end if;
  if p_external_cost_budget_cents < 0 or p_external_cost_budget_cents > 100000 then raise exception 'invalid external cost budget'; end if;
  if p_stripe_session_id is null or length(trim(p_stripe_session_id)) = 0 then raise exception 'stripe session required'; end if;

  select * into v_existing
  from public.pie_overage_ledger
  where stripe_session_id = p_stripe_session_id;

  if found and (
    v_existing.user_id <> p_user_id
    or v_existing.delta <> p_credits
    or v_existing.external_cost_budget_cents <> p_external_cost_budget_cents
  ) then
    raise exception 'stripe top-up conflict';
  end if;

  insert into public.pie_overage_ledger(
    user_id, period_start, delta, reason, stripe_session_id, external_cost_budget_cents
  ) values (
    p_user_id, v_period, p_credits, 'stripe_topup', p_stripe_session_id, p_external_cost_budget_cents
  ) on conflict (stripe_session_id) do nothing;

  if found then
    insert into public.pie_overage_balances(user_id, period_start, credits, updated_at)
    values (p_user_id, v_period, p_credits, now())
    on conflict (user_id, period_start) do update
      set credits = public.pie_overage_balances.credits + excluded.credits,
          updated_at = now()
    returning credits into v_balance;
  else
    select credits into v_balance
    from public.pie_overage_balances
    where user_id = p_user_id and period_start = v_period;
  end if;

  return coalesce(v_balance, 0);
end;
$$;

revoke all on function public.pie_grant_overage_credits(text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.pie_grant_overage_credits(text, integer, text, integer) to service_role;

create or replace function public.pie_reserve_external_cost(
  p_user_id text,
  p_usage_key text,
  p_provider text,
  p_model text,
  p_reserve_cents integer,
  p_reservation_id uuid
)
returns table(allowed boolean, reservation_id uuid, budget_cents integer, used_cents integer, remaining_cents integer, billing_status text, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_plan_id text;
  v_budget integer;
  v_period date;
  v_scope text;
  v_reserved integer;
  v_settled integer;
  v_topup_budget integer := 0;
  v_existing public.pie_external_cost_ledger%rowtype;
begin
  if p_user_id is null or length(p_user_id) < 1 or length(p_user_id) > 128
     or p_usage_key is null or length(p_usage_key) < 1 or length(p_usage_key) > 80
     or p_provider is null or length(p_provider) < 1 or length(p_provider) > 80
     or p_model is null or length(p_model) < 1 or length(p_model) > 120
     or p_reserve_cents is null or p_reserve_cents < 1 or p_reserve_cents > 100000
     or p_reservation_id is null then
    return query select false, p_reservation_id, 0, 0, 0, 'invalid'::text, 'Invalid external-cost reservation.'::text;
    return;
  end if;

  select l.* into v_existing
  from public.pie_external_cost_ledger l
  where l.reservation_id = p_reservation_id and l.user_id = p_user_id;

  if found then
    select b.budget_cents, b.reserved_cents, b.settled_cents
      into v_budget, v_reserved, v_settled
    from public.pie_external_cost_budgets b
    where b.user_id = v_existing.user_id and b.period_start = v_existing.period_start and b.scope = v_existing.scope;
    return query select
      (v_existing.status <> 'released'), v_existing.reservation_id, coalesce(v_budget,0),
      coalesce(v_reserved,0) + coalesce(v_settled,0),
      greatest(0, coalesce(v_budget,0) - coalesce(v_reserved,0) - coalesce(v_settled,0)),
      v_existing.scope,
      case when v_existing.status = 'released' then 'Reservation was released.' else 'Existing reservation.' end;
    return;
  end if;

  select b.status, b.plan_id into v_status, v_plan_id
  from public.pie_billing_customers b where b.user_id = p_user_id;
  if not found then
    return query select false, p_reservation_id, 0, 0, 0, 'inactive'::text, 'No active Pie billing record.'::text;
    return;
  end if;

  if v_status = 'trialing' then
    select e.trial_external_cost_budget_cents into v_budget
    from public.pie_plan_economics e where e.plan_id = v_plan_id;
    v_period := date '2000-01-01';
    v_scope := 'trial';
  elsif v_status = 'active' then
    select e.external_cost_budget_cents into v_budget
    from public.pie_plan_economics e where e.plan_id = v_plan_id;
    v_period := public.pie_billing_period_start(p_user_id)::date;
    v_scope := 'active';
    select coalesce(sum(l.external_cost_budget_cents),0)::integer into v_topup_budget
    from public.pie_overage_ledger l
    where l.user_id = p_user_id and l.period_start = v_period and l.reason = 'stripe_topup';
    v_budget := coalesce(v_budget,0) + v_topup_budget;
  else
    return query select false, p_reservation_id, 0, 0, 0, coalesce(v_status,'inactive'), 'Pie subscription is not active.'::text;
    return;
  end if;

  if v_budget is null then
    return query select false, p_reservation_id, 0, 0, 0, v_status, 'Plan economics are not configured.'::text;
    return;
  end if;

  insert into public.pie_external_cost_budgets(user_id, period_start, scope, budget_cents)
  values(p_user_id, v_period, v_scope, v_budget)
  on conflict (user_id, period_start, scope) do nothing;

  select b.reserved_cents, b.settled_cents into v_reserved, v_settled
  from public.pie_external_cost_budgets b
  where b.user_id = p_user_id and b.period_start = v_period and b.scope = v_scope
  for update;

  update public.pie_external_cost_budgets
  set budget_cents = v_budget, updated_at = now()
  where user_id = p_user_id and period_start = v_period and scope = v_scope;

  if coalesce(v_reserved,0) + coalesce(v_settled,0) + p_reserve_cents > v_budget then
    return query select false, p_reservation_id, v_budget,
      coalesce(v_reserved,0) + coalesce(v_settled,0),
      greatest(0, v_budget - coalesce(v_reserved,0) - coalesce(v_settled,0)),
      v_status, 'Protected external-cost budget reached.'::text;
    return;
  end if;

  update public.pie_external_cost_budgets
  set reserved_cents = reserved_cents + p_reserve_cents, updated_at = now()
  where user_id = p_user_id and period_start = v_period and scope = v_scope;

  insert into public.pie_external_cost_ledger(
    reservation_id, user_id, period_start, scope, usage_key, provider, model, reserved_cents
  ) values (
    p_reservation_id, p_user_id, v_period, v_scope, p_usage_key, p_provider, p_model, p_reserve_cents
  );

  return query select true, p_reservation_id, v_budget,
    coalesce(v_reserved,0) + coalesce(v_settled,0) + p_reserve_cents,
    greatest(0, v_budget - coalesce(v_reserved,0) - coalesce(v_settled,0) - p_reserve_cents),
    v_status, 'Reserved.'::text;
end;
$$;

revoke all on function public.pie_reserve_external_cost(text, text, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.pie_reserve_external_cost(text, text, text, text, integer, uuid) to service_role;

commit;
