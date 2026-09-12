-- Request receipts are accounting evidence, never customer entitlements.
create table public.pie_provider_requests (
 id uuid primary key,
 environment text not null check(environment in ('preview','production')),
 user_id text not null,
 job_id uuid references public.pie_jobs(id),
 feature text not null,
 provider text not null check(provider in ('openai','elevenlabs','mureka','kits','klangio')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'started' check(status in ('started','accepted','rejected','unknown')),
 http_status integer check(http_status between 100 and 599),
 receipt jsonb not null default '{}'::jsonb,
 estimated_usd numeric(18,8) check(estimated_usd>=0),
 estimate_source text,
 confirmed_usd numeric(18,8) check(confirmed_usd>=0),
 confirmation_source text,
 check((estimated_usd is null) = (estimate_source is null)),
 check((confirmed_usd is null) = (confirmation_source is null))
);
alter table public.pie_provider_requests enable row level security;
revoke all on public.pie_provider_requests from anon, authenticated;
grant select,insert,update on public.pie_provider_requests to service_role;
create index pie_provider_requests_scope on public.pie_provider_requests(environment,user_id,started_at);
comment on column public.pie_provider_requests.confirmed_usd is 'Only a reconciled provider charge attributable to this request, with source evidence. Never allocate an invoice equally and call it confirmed.';
comment on column public.pie_provider_requests.estimated_usd is 'Optional estimate from measured usage and a documented applicable rate. Missing rate means NULL, not zero.';

create function public.pie_provider_summary(p_environment text,p_user_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'requestCount',count(*),'acceptedCount',count(*) filter(where status='accepted'),
 'pendingCount',count(*) filter(where status in ('started','unknown')),
 'estimatedUsd',sum(estimated_usd) filter(where confirmed_usd is null),
 'estimatedCount',count(*) filter(where estimated_usd is not null and confirmed_usd is null),
 'confirmedUsd',sum(confirmed_usd),'confirmedCount',count(confirmed_usd),
 'unpricedCount',count(*) filter(where confirmed_usd is null and estimated_usd is null),
 'periodStart',date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',
 'trackingStartedAt',min(started_at),
 'coverage','partial'
 ) from public.pie_provider_requests
 where environment=p_environment and user_id=p_user_id
 and started_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
$$;
revoke all on function public.pie_provider_summary(text,text) from public,anon,authenticated;
grant execute on function public.pie_provider_summary(text,text) to service_role;

