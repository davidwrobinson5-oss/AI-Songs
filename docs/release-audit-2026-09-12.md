# Pie release verification — 2026-09-12

## Cost accounting increment

The provider request ledger is service-only, with RLS and no anonymous/customer table privileges. Requests are scoped by verified Vercel environment and server-resolved user identity; queued work also links its job ID. Only accounting identifiers and numeric usage are retained, not prompts/audio/credentials.

Covered transports: OpenAI SDK routes, ElevenLabs music/voice/reference/stems, Mureka precision guide and lyric song generation, Kits conversion/separation, Klangio transcription/chords/stems, queued ElevenLabs generation. GET polls/downloads are not new attempts. Each POST is an attempt, not proof of a billable charge or successful final artifact.

Measured units, estimates and confirmed USD are distinct. Estimates require documented applicable rates; confirmed USD requires attributable provider charge evidence. Missing prices remain NULL. No rates or charge amounts have been fabricated or backfilled. Flat subscriptions and bank reconciliation remain in the monthly cost review, not allocated as confirmed per-request costs. Suno and other configurable/legacy transports still require inventory before claiming full coverage. Asynchronous task completion/cost reconciliation remains follow-up work.

Deployment prerequisites applied: provider_request_accounting SQL; pie-provider-usage v1; pie-jobs v3. App transport/UI changes require the accompanying PR deployment.

Verification: TypeScript; 15 unit tests; six mocked fetch scenarios (success, receipt begin failure, receipt finish failure/retry, provider network failure, binary response, GET passthrough); six owner/customer/project-auth routing checks; rolled-back SQL assertions for estimated vs unknown totals and environment isolation; RLS/grant checks. These do not replace a deployed authenticated request test.

## Live parity baseline

Production and shared Preview at baseline 8d215f6f16f75551a6b88d66239dbbd67d1c093c.

All 19 navigation tabs opened with matching main headings: Music, Voice, Songs, Mix, Sheets, Video, Merch, Band, Gigs, Calendar, Scoreboard, Marketing, Data, Licensing, Legal, Travel, Business, Accounting, Cyber Security.

Songs shows the same ten library entries and visible version counts in both sessions. Sheets displays no saved files in either session; absence is not proof of persistence correctness. No user data was modified during this navigation pass.

Intermittent finding: Production Data reported 'Pie data service failed' and incorrectly displayed default Stage 1. A fresh load recovered Stage 8 owner access; Preview resolves Stage 2. Runtime logs confirm both 200 and 400 responses. This PR now shows loading/error with Retry instead of a false Stage 1 on failed initial load. The upstream transient service failure still requires monitoring. Both Accounting tabs show zero linked bank accounts; the ChatGPT monthly Finances/Gmail automation is separate from the app's Plaid connection.

## Remaining release gates

- Diagnose Production Data error; check data save/reload/cross-tab behavior and isolation for a separate customer.
- Complete every feature's real integration workflow; navigation parity alone is insufficient.
- Exercise signup, checkout, credits, renewal, downgrade, cancellation, failed payment/recovery in Stripe test mode. Existing billing unit tests pass but the full lifecycle has not been rerun in this increment.
- Collect attributable provider usage/charges and fixed costs before finalizing plan margins. Current prices/credits are provisional; no changes made.
- Verify Android Chrome and Apple Safari recording, playback, uploads, downloads, keyboard/layout and interrupted sessions. Cloud Chromium navigation is not a physical-device certification.

## Billing continuation — 2026-09-13

Found webhook snapshots could overwrite recovered access when delivered late; checkout always wrote trialing, and tier selection trusted plan metadata rather than the actual subscription price. The webhook now retrieves current Stripe subscription state for subscription, checkout and invoice paid/success/failure events; validates customer, environment and user identity; maps the current price to the plan; and avoids letting a prior subscription displace a currently linked nonterminal subscription.

Nine signed, locally simulated webhook scenarios pass: active checkout, renewal boundary, recovery, delayed failed invoice after recovery, past-due blocking, price-based downgrade with stale metadata, cancellation, trial access and unknown-price rejection without writes. These are mocked regression tests, not live Stripe test-clock certification. Parallel in-flight webhook reconciliation and full end-to-end lifecycle remain verification gates. Source: https://docs.stripe.com/webhooks and https://docs.stripe.com/billing/subscriptions/webhooks.
