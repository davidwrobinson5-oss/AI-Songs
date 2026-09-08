# Pie Foundation Phase 2

Date: 2026-09-08
Status: implementation

## What this phase adds

### Durable jobs

Pie now has a Supabase-backed durable job ledger (`public.pie_jobs`) for long-running work.

Supported initial job families:

- song_generation
- stem_separation
- voice_conversion
- sheet_transcription
- video_generation
- originality_analysis
- venue_import

The queue records user, type, status, input/output metadata, retry attempts, provider IDs, idempotency keys, error state, leases, and timestamps.

`pie_claim_jobs(...)` claims ready jobs with `FOR UPDATE SKIP LOCKED`, increments attempts, and assigns a lease. This prevents two workers from processing the same job at the same time.

The queue is service-role only. Direct anonymous or authenticated PostgREST access is revoked.

### Idempotency

Jobs are unique on `(user_id, type, idempotency_key)`. Repeating the same request with the same idempotency key returns the existing job rather than creating duplicate provider work.

### Retry policy

`markPieJobFailed()` uses bounded exponential retry delay and stops retrying when the job reaches its maximum attempts or the failure is classified as permanent.

### User job API

`GET /api/jobs` returns the signed-in user's recent jobs.

`POST /api/jobs` queues only approved job types and derives the user identity on the server. Clients cannot choose another user's ID.

This API creates durable work records; provider-specific workers will be migrated onto it incrementally so existing features are not destabilized all at once.

## Browser E2E gate

Playwright coverage now checks the canonical Pie prelaunch deployment with:

- Chromium / Chrome engine
- Firefox
- WebKit / Safari engine
- iPhone 15 mobile Safari emulation

Current tests verify:

- health endpoint
- signup renders
- required local signup fields render
- broken Google OAuth button remains hidden
- local signup can advance toward Clerk without creating a real account
- signed-out billing checkout is rejected
- signed-out users cannot reach trial setup

The workflow stores traces, screenshots, and video on failures.

## Important browser limitation

Playwright engine coverage is not the same as native device certification.

Before public launch Pie still requires manual/native checks on:

- Brave
- Chrome
- Samsung Internet
- Firefox
- Safari on a real iPhone
- Edge

Brave, Samsung Internet, and Edge are Chromium-derived but have different privacy/network behavior. Safari emulation cannot replace a final real-iPhone check.

## Queue migration order

Migrate high-risk provider work in this order:

1. song generation
2. stem separation
3. voice conversion
4. sheet transcription
5. video generation
6. originality analysis
7. venue import/enrichment

For each migration:

1. create a stable idempotency key before calling the provider
2. enqueue the job
3. worker claims the job with a lease
4. reserve any external-cost budget
5. call provider with a bounded timeout
6. store provider job ID immediately
7. poll or receive callback without creating duplicate provider work
8. settle cost only against actual work
9. mark succeeded or retry/failed
10. UI reads durable job status instead of relying on browser memory

## Next foundation work

- migrate the first real provider flow onto the queue
- add structured request/provider/job correlation IDs
- add telemetry backend and alerts for queue age/failure rate
- verify Supabase backup/PITR plan and perform a restore drill
- add Stripe webhook E2E fixtures
- add a safe Clerk test-user path when the production/test-instance strategy is finalized
