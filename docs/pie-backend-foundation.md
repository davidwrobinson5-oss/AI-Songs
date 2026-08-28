# Pie backend foundation

This branch introduces the persistence and integration architecture for Pie without changing the current production branch.

## Product domains

- Studio: music, vocals, mix, sheets
- Songs: unified project/version model
- Band: collaboration and permissions
- Brand: logos, photos, videos, reference boards, templates
- Launch: releases, marketing plans, campaigns, contests, giveaways, scheduled follow-ups, social publishing, music distribution
- Fans: CRM, segments, consent, email/SMS/phone/mail/message activity
- Analytics: campaign, fan, social and release performance

## Architecture

- Next.js/Vercel remains the web and API runtime.
- Clerk remains authentication and organization membership.
- PostgreSQL becomes the durable source of truth for product data.
- Object storage holds audio, video, images, PDFs and exports. Storage access is abstracted behind provider interfaces.
- External services are wrapped behind provider adapters so Pie can change vendors without changing UI/domain code.
- Webhooks are normalized into provider_events and processed idempotently.
- Jobs are recorded in jobs so long-running work can be retried and observed.

## Suggested provider adapters

Communication:
- Email: Resend
- SMS/Voice: Twilio
- Physical mail: Lob

Distribution/social:
- Music distribution: provider interface intended for Revelator or another distributor API; DistroKid can be represented as a handoff flow if no platform API is available.
- Social: TikTok, YouTube, Meta/Instagram/Facebook, future providers.

AI/media providers already present in the codebase continue behind their existing API routes and should gradually be wrapped in shared provider interfaces.

## Environment variables to add when services are connected

DATABASE_URL=
PIE_STORAGE_PROVIDER=
PIE_STORAGE_TOKEN=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
LOB_API_KEY=
DISTRIBUTION_PROVIDER=
DISTRIBUTION_API_KEY=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=

Do not expose these in client-side code.

## Rollout order

1. Run `db/migrations/001_pie_foundation.sql` against the selected Postgres database.
2. Add the database driver/ORM and implement repositories against the schema.
3. Move Band posts from Clerk metadata to `band_posts`, preserving Clerk organization IDs as foreign identity keys.
4. Implement Brand + Fans APIs first.
5. Implement Campaign/Launch APIs and scheduler/job worker.
6. Add email/SMS/mail providers plus consent enforcement.
7. Add social connectors and normalized publishing states.
8. Add music-distribution provider and webhook sync.
9. Add analytics rollups and AI recommendations.

## Safety / compliance rules

- Every outbound marketing communication must check channel consent before send.
- Store the source, timestamp and status of consent changes.
- STOP/unsubscribe/provider opt-out webhooks must immediately update the corresponding channel consent.
- Contests store rules, eligibility, entry source, timestamps, winner-selection record and audit metadata.
- Provider webhook events use a unique `(provider, external_event_id)` key to prevent duplicate processing.
- Secrets stay server-side in Vercel environment variables.
