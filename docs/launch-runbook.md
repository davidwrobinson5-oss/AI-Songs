# Pie launch runbook

## Environment roles

| Environment | Source | Customer services | Public access |
| --- | --- | --- | --- |
| Preview | Feature/PR branch | Clerk development, Stripe test, test Supabase | Vercel-protected preview |
| Staging | `staging` branch | Clerk development, Stripe test, test Supabase | Team/testing only |
| Production | `main` | Clerk production, Stripe live, production Supabase | Gated until launch |

Staging and Production must use the same approved source commit. Credentials and data stores must remain separate.

## Promotion flow

1. Deploy a feature branch to Preview and run browser checks.
2. Move the approved commit to `staging` and run the complete signup, billing, webhook, data, email, mobile, and rollback rehearsal.
3. Move that exact commit to `main` and deploy Production to Production with `PIE_PUBLIC_LAUNCH=false`.
4. Confirm `/api/health` reports `launch.configurationReady=true` and all core checks pass.
5. Run the authenticated deep readiness probe and confirm Clerk, Stripe, and Supabase connectivity.
6. Set `PIE_PUBLIC_LAUNCH=true`, redeploy the same commit, verify the public domain, and monitor errors.

Production remains gated if any required live configuration is missing, even when `PIE_PUBLIC_LAUNCH=true`.

## Rollback

1. Set `PIE_PUBLIC_LAUNCH=false` and redeploy to close customer access.
2. Roll back the Production alias to the last verified deployment.
3. Confirm health, owner access, webhook delivery, and data integrity before reopening.

## Never copy between environments

- Stripe secret keys, webhook signing secrets, and live price IDs
- Clerk production secret keys
- Supabase production URL/key or customer data
- Plaid production credentials

Shared non-secret configuration may be copied only after its scope is reviewed.
