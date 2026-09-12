-- Owner access is independent of Stripe. Only the trusted service can execute this RPC.
create table if not exists public.pie_owner_meter_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('preview','production')),
  user_id text not null,
  action text not null check (action in ('consume','reserveCost','settleCost','releaseCost')),
  reference_id uuid not null,
  usage_key text not null default '',
  provider text not null default '',
  model text not null default '',
  units integer not null default 0 check (units between 0 and 100),
  credits integer not null default 0 check (credits between 0 and 800),
  cents integer not null default 0 check (cents between 0 and 100000),
  created_at timestamptz not null default now(),
  unique(environment, action, reference_id)
);
alter table public.pie_owner_meter_events enable row level security;
revoke all on public.pie_owner_meter_events from public, anon, authenticated;
grant select, insert on public.pie_owner_meter_events to service_role;
create index if not exists pie_owner_meter_period on public.pie_owner_meter_events(environment, created_at);

create or replace function public.pie_owner_meter(p_environment text, p_user_id text, p_action text, p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ref uuid;
  v_job uuid;
  v_key text;
  v_units integer;
  v_weight integer;
  v_cents integer;
  v_existing public.pie_owner_meter_events%rowtype;
  v_reserve public.pie_owner_meter_events%rowtype;
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_result jsonb;
begin
  if p_environment is null or p_environment not in ('preview','production') or p_user_id is null
    or not (p_user_id = 'pie-primary' or (p_environment = 'production' and p_user_id = 'user_3JFNRykFY9nfjkxHkVkUBvPA34P')) then
    raise exception 'Owner access required';
  end if;
  if p_action = 'summary' then
    select jsonb_build_object(
      'planId','internal','planLevel',8,'status','active','computeLimit',null,'overageCredits',0,
      'computeUsed',coalesce(sum(credits) filter (where action='consume'),0),
      'ownerUsageRequests',count(*) filter (where action='consume'),
      'ownerUsageUnits',coalesce(sum(units) filter (where action='consume'),0),
      'recordedProviderCostCents',coalesce(sum(cents) filter (where action='settleCost'),0),
      'providerCostReports',count(*) filter (where action='settleCost'),
      'costCoverage','incomplete','periodStart',v_month,'resetAt',null,
      'trackingStartedAt',(select min(created_at) from public.pie_owner_meter_events where environment=p_environment)
    ) into v_result from public.pie_owner_meter_events where environment=p_environment and created_at>=v_month;
    return v_result;
  end if;
  if p_action in ('consume','consumeJob') then
    v_key := trim(coalesce(p_body->>'usageKey',''));
    v_units := coalesce((p_body->>'units')::integer,1);
    if length(v_key) not between 1 and 80 or v_units not between 1 and 100 then raise exception 'Invalid usage'; end if;
    if p_action='consumeJob' then
      v_job := (p_body->>'jobId')::uuid;
      if v_job is null or not exists(select 1 from public.pie_jobs where id=v_job and user_id=p_user_id) then raise exception 'Job ownership could not be verified'; end if;
      v_ref := v_job;
    else
      v_ref := coalesce((p_body->>'requestId')::uuid, gen_random_uuid());
    end if;
    -- Match the customer credit weights; these measure requests, not dollars or successful outputs.
    v_weight := case
      when lower(v_key) like '%video%plan%' then 1
      when lower(v_key) like '%video%' then 6
      when lower(v_key) like '%music%' or lower(v_key) like '%remix%' or lower(v_key) like '%song%generat%' or lower(v_key) like '%audio%generat%' then 4
      when lower(v_key) ~ '(voice|vocal|harmony|choir|double|inference)' then 2
      when lower(v_key) ~ '(stem|separation|sheet|transcrib|chord)' then 3
      else 1 end;
    insert into public.pie_owner_meter_events(environment,user_id,action,reference_id,usage_key,units,credits)
      values(p_environment,p_user_id,'consume',v_ref,v_key,v_units,v_weight*v_units) on conflict do nothing;
    select * into v_existing from public.pie_owner_meter_events where environment=p_environment and action='consume' and reference_id=v_ref;
    if v_existing.user_id<>p_user_id or v_existing.usage_key<>v_key or v_existing.units<>v_units then raise exception 'Usage reference conflict'; end if;
    return jsonb_build_object('planId','internal','planLevel',8,'status','active','allowed',true,'usageLimit',null,'outputQuality','premium','meterReferenceId',v_ref,
      'usageCount',(select coalesce(sum(units),0) from public.pie_owner_meter_events where environment=p_environment and action='consume' and usage_key=v_key and created_at>=v_month));
  end if;
  if p_action not in ('reserveCost','settleCost','releaseCost') then raise exception 'Unknown owner action'; end if;
  v_ref := (p_body->>'reservationId')::uuid;
  if v_ref is null then raise exception 'Reservation ID required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment||v_ref::text,0));
  select * into v_reserve from public.pie_owner_meter_events where environment=p_environment and action='reserveCost' and reference_id=v_ref;
  if p_action='reserveCost' then
    v_cents := (p_body->>'reserveCents')::integer;
    v_key := trim(coalesce(p_body->>'usageKey',''));
    if v_cents is null or v_cents not between 1 and 100000 or length(v_key) not between 1 and 80
      or length(coalesce(p_body->>'provider','')) not between 1 and 80 or length(coalesce(p_body->>'model','')) not between 1 and 120 then raise exception 'Invalid reservation'; end if;
    if v_reserve.id is not null and (v_reserve.user_id<>p_user_id or v_reserve.cents<>v_cents or v_reserve.usage_key<>v_key or v_reserve.provider<>p_body->>'provider' or v_reserve.model<>p_body->>'model') then raise exception 'Reservation conflict'; end if;
    insert into public.pie_owner_meter_events(environment,user_id,action,reference_id,usage_key,provider,model,cents)
      values(p_environment,p_user_id,p_action,v_ref,v_key,p_body->>'provider',p_body->>'model',v_cents) on conflict do nothing;
    return jsonb_build_object('allowed',not exists(select 1 from public.pie_owner_meter_events where environment=p_environment and reference_id=v_ref and action in ('settleCost','releaseCost')),
      'reservationId',v_ref,'budgetCents',null,'remainingCents',null,'billingStatus','internal','reason','Owner cost reservation recorded.');
  end if;
  if v_reserve.id is null or v_reserve.user_id<>p_user_id then raise exception 'Reservation ownership could not be verified'; end if;
  select * into v_existing from public.pie_owner_meter_events where environment=p_environment and reference_id=v_ref and action in ('settleCost','releaseCost');
  v_cents := case when p_action='settleCost' then (p_body->>'actualCents')::integer else 0 end;
  if v_cents is null or v_cents not between 0 and 100000 then raise exception 'Invalid settlement'; end if;
  if v_existing.id is not null and (v_existing.action<>p_action or v_existing.cents<>v_cents) then raise exception 'Reservation already finalized'; end if;
  insert into public.pie_owner_meter_events(environment,user_id,action,reference_id,usage_key,provider,model,cents)
    values(p_environment,p_user_id,p_action,v_ref,v_reserve.usage_key,v_reserve.provider,v_reserve.model,v_cents) on conflict do nothing;
  return jsonb_build_object('ok',true,'remainingCents',null,'reason','Owner cost event recorded.');
end;
$$;
revoke all on function public.pie_owner_meter(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.pie_owner_meter(text,text,text,jsonb) to service_role;
