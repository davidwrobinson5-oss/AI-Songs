create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text unique,
  owner_clerk_user_id text not null,
  name text not null,
  kind text not null default 'artist' check (kind in ('artist','band','team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  owner_clerk_user_id text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','archived','released')),
  bpm numeric,
  musical_key text,
  vocal_range text,
  cover_asset_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  version_no integer not null,
  label text,
  kind text not null check (kind in ('music','vocal','mix','sheet','master','project')),
  status text not null default 'draft' check (status in ('draft','processing','ready','failed','archived')),
  payload jsonb not null default '{}'::jsonb,
  created_by_clerk_user_id text not null,
  created_at timestamptz not null default now(),
  unique(song_id, kind, version_no)
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  uploaded_by_clerk_user_id text not null,
  type text not null check (type in ('audio','stem','image','video','sheet','document','logo','reference','export')),
  storage_provider text not null,
  storage_key text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  duration_ms bigint,
  width integer,
  height integer,
  status text not null default 'ready' check (status in ('uploading','ready','failed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table songs drop constraint if exists songs_cover_asset_fk;
alter table songs add constraint songs_cover_asset_fk foreign key (cover_asset_id) references media_assets(id) on delete set null;

create table if not exists band_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  song_id uuid references songs(id) on delete set null,
  author_clerk_user_id text not null,
  parent_id uuid references band_posts(id) on delete cascade,
  kind text not null check (kind in ('idea','song','lyrics','arrangement','mix','brand','launch')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  short_name text not null default 'Pie',
  full_name text,
  tagline_primary text,
  tagline_secondary text,
  voice_notes text,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  category text not null check (category in ('logo','photo','video','reference','template','cover','press','other')),
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','archived')),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists fans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  mailing_address jsonb,
  social_profiles jsonb not null default '{}'::jsonb,
  city text,
  region text,
  country text,
  birthday date,
  tags text[] not null default '{}',
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fans_workspace_email_unique on fans(workspace_id, lower(email)) where email is not null;
create index if not exists fans_workspace_phone_idx on fans(workspace_id, phone) where phone is not null;
create index if not exists fans_tags_gin on fans using gin(tags);

create table if not exists fan_consents (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references fans(id) on delete cascade,
  channel text not null check (channel in ('email','sms','voice','mail','message')),
  status text not null check (status in ('opted_in','opted_out','unknown')),
  source text,
  source_detail text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists fan_consents_latest_idx on fan_consents(fan_id, channel, occurred_at desc);

create table if not exists fan_events (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references fans(id) on delete cascade,
  type text not null,
  channel text,
  song_id uuid references songs(id) on delete set null,
  campaign_id uuid,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists fan_events_timeline_idx on fan_events(fan_id, occurred_at desc);

create table if not exists fan_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  filter jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  song_id uuid references songs(id) on delete set null,
  name text not null,
  goal text,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','scheduled','active','paused','completed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  budget_cents bigint,
  plan jsonb not null default '{}'::jsonb,
  created_by_clerk_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fan_events drop constraint if exists fan_events_campaign_fk;
alter table fan_events add constraint fan_events_campaign_fk foreign key (campaign_id) references campaigns(id) on delete set null;

create table if not exists campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  segment_id uuid references fan_segments(id) on delete set null,
  type text not null check (type in ('email','sms','voice','mail','social','contest','giveaway','follow_up','distribution','task')),
  provider text,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','scheduled','processing','sent','published','complete','failed','cancelled')),
  scheduled_for timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_steps_schedule_idx on campaign_steps(status, scheduled_for) where scheduled_for is not null;

create table if not exists contests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  kind text not null default 'contest' check (kind in ('contest','giveaway')),
  prize text not null,
  rules text,
  eligibility jsonb not null default '{}'::jsonb,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft','open','closed','winner_selected','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  fan_id uuid not null references fans(id) on delete cascade,
  source text,
  referral_code text,
  entry_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(contest_id, fan_id)
);

create table if not exists contest_winners (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  fan_id uuid not null references fans(id) on delete restrict,
  selected_by_clerk_user_id text,
  selection_method text not null,
  audit jsonb not null default '{}'::jsonb,
  selected_at timestamptz not null default now()
);

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  song_id uuid references songs(id) on delete set null,
  title text not null,
  release_type text not null default 'single' check (release_type in ('single','ep','album')),
  status text not null default 'draft' check (status in ('draft','validation','ready','submitted','processing','scheduled','live','rejected','takedown')),
  release_date date,
  metadata jsonb not null default '{}'::jsonb,
  artwork_asset_id uuid references media_assets(id) on delete set null,
  master_asset_id uuid references media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists distribution_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  provider text not null,
  destination text,
  external_id text,
  status text not null default 'queued',
  last_error text,
  provider_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists social_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  account_label text,
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  credential_ref text,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, provider, external_account_id)
);

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_step_id uuid references campaign_steps(id) on delete set null,
  connection_id uuid not null references social_connections(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','scheduled','processing','published','failed','cancelled')),
  caption text,
  media_asset_ids uuid[] not null default '{}',
  scheduled_for timestamptz,
  external_post_id text,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  type text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting','complete','failed','cancelled')),
  idempotency_key text unique,
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_claim_idx on jobs(status, run_after) where status in ('queued','waiting');

create table if not exists provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now(),
  unique(provider, external_event_id)
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  fan_id uuid references fans(id) on delete set null,
  song_id uuid references songs(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  release_id uuid references releases(id) on delete set null,
  source text not null,
  metric text not null,
  value numeric not null default 1,
  dimensions jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists analytics_rollup_idx on analytics_events(workspace_id, occurred_at desc, source, metric);
