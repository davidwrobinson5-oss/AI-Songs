alter table public.workspaces enable row level security;
alter table public.songs enable row level security;
alter table public.song_versions enable row level security;
alter table public.media_assets enable row level security;
alter table public.band_posts enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_assets enable row level security;
alter table public.fans enable row level security;
alter table public.fan_consents enable row level security;
alter table public.fan_events enable row level security;
alter table public.fan_segments enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_winners enable row level security;
alter table public.releases enable row level security;
alter table public.distribution_deliveries enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_posts enable row level security;
alter table public.jobs enable row level security;
alter table public.provider_events enable row level security;
alter table public.analytics_events enable row level security;

-- No client-facing policies yet. Pie's Next.js server routes will access these tables
-- with a server-only Supabase secret after Clerk has authenticated the request.
