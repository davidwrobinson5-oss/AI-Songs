# Pie Production Foundation

Date: 2026-09-08
Status: Phase 1 implementation

## Goal

Make Pie resilient enough that feature growth does not outpace reliability, security, recovery, or operational understanding.

## Current architecture

- Web/app runtime: Next.js on Vercel
- Source control and CI/CD: GitHub + GitHub Actions
- Authentication: Clerk
- Billing: Stripe
- Primary application data: Supabase
- Maps/opportunity discovery: Mapbox plus venue import sources
- AI/audio providers: OpenAI, ElevenLabs, Kits, Soundverse, Mureka and related provider adapters
- Mobile capture: Android recorder project

## Foundation controls implemented

### 1. Runtime health endpoint

`GET /api/health` reports whether core runtime configuration is present without returning secrets. It is intentionally uncached.

### 2. Production smoke testing

`scripts/smoke-test.mjs` validates the canonical Vercel production alias. It checks home, signup, signin, and health routes with bounded request timeouts.

`.github/workflows/pie-smoke-test.yml` runs this every hour, on pushes to main, and manually.

### 3. Security monitoring target

Until `pieinears.ai` is intentionally launched, the runtime security alarm targets the canonical production Vercel alias instead of the dormant custom domain.

### 4. Existing controls retained

- CodeQL
- Dependabot
- Weekly Pie Code Health Agent
- PDF health reports
- Runtime security alarm
- SECURITY.md
- Git history and rollback points

## Phase 2: automated product tests

Add browser-level tests for the highest-risk customer journeys:

1. signup page renders
2. email signup can begin
3. verified user reaches onboarding
4. email verification is required server-side
5. Stripe sandbox checkout can be created
6. subscription webhook grants the correct plan
7. usage/credit enforcement prevents accidental overage
8. core music upload/generation path handles provider timeout/retry

Target browsers before public launch: Chromium/Chrome, Brave, Edge, Firefox, Samsung Internet, and Safari/iPhone. Native engine coverage must not be inferred from Chromium-only tests.

## Phase 3: durable jobs

Long-running work should move behind a durable job abstraction instead of tying success to one browser request.

Initial job families:

- song generation
- stem separation
- voice conversion
- sheet transcription
- video generation
- originality analysis
- venue import/enrichment

Required job fields:

- id
- user_id
- type
- status: queued | running | retrying | succeeded | failed | cancelled
- input reference
- output reference
- attempt_count
- max_attempts
- next_attempt_at
- idempotency_key
- provider
- provider_job_id
- last_error_code
- last_error_message
- created_at / started_at / completed_at / updated_at

Rules:

- jobs must be idempotent
- provider timeouts must not create duplicate paid work
- temporary failures retry with exponential backoff and jitter
- permanent failures stop automatically
- user-visible status comes from the job record, not browser memory
- all paid provider calls must be correlated to user, job, and billing usage records

Preferred implementation: Supabase-backed durable job ledger first, with a dedicated worker/queue service added when throughput requires it.

## Phase 4: observability

Add structured events for:

- route latency and failures
- provider request latency/failure/rate-limit
- auth failures
- checkout and webhook failures
- job queue age/retries/failures
- database failures
- client crashes

Every event should carry a request/correlation ID. Never log passwords, Clerk secrets, Stripe secrets, access tokens, full payment data, or raw private user content unnecessarily.

## Phase 5: backup and disaster recovery

Before public launch define and verify:

- Supabase backup/PITR policy
- object/audio storage backup policy
- Clerk/Stripe recovery dependencies
- environment variable inventory and secret rotation procedure
- GitHub/Vercel recovery procedure
- RPO target: <= 24 hours initially, then tighten for billing-critical data
- RTO target: <= 4 hours initially

Quarterly recovery drill:

1. restore database copy to isolated environment
2. verify users/projects/song metadata
3. verify billing linkage without sending live charges
4. verify stored file references
5. run smoke suite
6. record actual restore duration and gaps

## Runbook: failed deployment

1. Confirm Vercel deployment state and build logs.
2. Confirm `/api/health` on the last known-good deployment.
3. If current main is broken, roll back to the last known-good commit/deployment.
4. Do not alter production data to compensate for a code deployment failure.
5. Create a small fix branch, run build/security/smoke checks, then redeploy.

## Runbook: third-party provider outage

1. Mark the provider degraded.
2. Stop creating duplicate provider jobs.
3. Keep pending jobs durable.
4. Retry only retryable failures with backoff.
5. Surface a useful status to the user.
6. Resume the queue when provider health returns.
7. Reconcile billed usage against completed provider work.

## Runbook: suspected security incident

1. Preserve logs and runtime-alarm evidence.
2. Disable or rotate the affected credential, not unrelated services.
3. Identify impacted requests/users/data.
4. Block the exploit path.
5. Patch and test before restoring normal traffic.
6. Record root cause and prevention action.

## Launch gate

Pie should not be treated as production-ready until all of the following are true:

- build passes
- CodeQL/security checks pass
- smoke suite passes
- signup works on required browsers/devices
- billing sandbox end-to-end passes
- backup policy is enabled and restore tested
- critical provider calls have timeout/retry/idempotency controls
- user-facing failures are recoverable and observable
- rollback procedure is tested
