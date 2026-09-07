# Pie Pricing & Predictable Economics Architecture

Timestamp: 2026-09-07 (America/Los_Angeles)
Status: Approved product direction; implementation values still configurable.

## Subscription ladder

Keep the existing paid ladder and 7-day trial:

- $9
- $19
- $29
- $49
- $79
- $129
- $199

Add higher scale tiers later without adding new career stages:

- $299 Headliner (working name)
- $499 Label (working name)
- $999 Enterprise (working name)

World Legend remains the highest career stage. Higher paid tiers increase operating scale rather than inventing additional career stages.

## Pricing curve

### $9-$49: Creation competition

Pie must compete directly with dedicated music and video generation products. These tiers should feel creation-rich and easy to compare against tools such as Suno and leading AI video generators.

Customer-facing allowances should emphasize useful outputs rather than raw provider credits, for example:

- Song drafts / ideas / variations
- Finished songs
- Video previews
- HD/final video renders
- Voice renders
- Stems / sheets

Draft and preview work should be inexpensive and abundant. Final, HD, premium, export, and other expensive steps should be metered more carefully.

### $79-$199: Artist operating system

Creation stays generous, but subscription value increasingly comes from:

- Gigs and booking
- Marketing
- Fan CRM/database
- Distribution coordination
- Campaigns
- Merch
- Touring and travel
- Data and analytics
- Licensing and legal workflows
- Business and accounting
- AI agents and automation

Creation allowance should continue growing, but more slowly than subscription price.

### $299-$999+: Growth, management, and business scale

Content generation largely flattens. Additional subscription dollars buy operating leverage:

- AI marketing management
- Multiple specialized agents
- Campaign planning and optimization
- Team seats and permissions
- Fan CRM automation
- Advanced analytics
- Business/financial workflows
- Priority processing/support
- Label/team operations
- API/integration capabilities where appropriate

No tier should imply unrealistic values such as thousands of finished songs simply because the monthly price is higher.

## Predictable economics rules

1. Pie Credits are an internal economic governor, not a 1:1 synonym for songs or provider credits.
2. Customer-facing UX should describe useful outputs; provider/API cost mapping stays behind the scenes.
3. Each action maps to an internal maximum cost envelope.
4. Pie can change providers or model versions without changing customer-facing subscription prices.
5. Draft/preview generations should route to the lowest-cost provider/model that meets quality needs.
6. Premium/final outputs can route to more expensive providers/models.
7. Failed attempts and internal retries should be absorbed by reserve -> settle/refund logic where possible, rather than surprising customers with extra charges.
8. Track actual provider/model, actual estimated USD cost, Pie credits reserved/charged/refunded, retries, candidate count, finalization/export usage, revenue allocation, and gross margin.
9. Set internal action pricing from cost data, not from competitor credit labels.
10. Maintain a configurable gross-margin floor so vendor price changes cannot silently make a tier unprofitable.

## Hard margin and risk policy

Pie should protect margin at the account level, not only through average-user assumptions.

### Paid subscriptions

- Design target: at least 80% contribution margin after direct variable AI/API costs when all included creation allowance is consumed.
- Hard redline: direct variable AI/API cost should never exceed 25% of subscription revenue from included usage without an explicit business decision.
- Each subscription gets a monthly internal USD cost envelope in addition to customer-facing allowances.
- Every provider call must reserve its estimated maximum cost before execution.
- If the reserve would exceed the account cost envelope, Pie should automatically choose a cheaper qualifying model/provider, lower an optional quality level, use a preview path, require prepaid top-up capacity, or stop the request before incurring the cost.
- Never depend on breakage or low utilization to make a plan profitable. Heavy users who consume 100% of their included allowance must still remain inside the configured margin floor.
- Provider price increases should trigger an internal alert when an action's modeled margin falls below target.
- Premium features with highly variable costs should have separate limits even when the user has remaining general creation capacity.
- Actual third-party ad spend is excluded from the subscription cost envelope and is funded separately through a marketing wallet.

### 7-day trial

The trial is a product demonstration and conversion tool, not a smaller version of an unlimited paid plan.

- Require a valid payment method before starting the 7-day trial.
- Hard external-cost cap per trial account: no more than the lesser of $1.00 or 10% of the selected plan's first monthly subscription price unless deliberately changed after conversion testing.
- Use low-cost preview/draft models first.
- Allow enough creation to prove the core experience, but tightly limit expensive finalization, HD video, premium models, long generations, stem-heavy processing, voice training, and other high-cost actions.
- No prepaid top-ups while an account is trialing.
- No automatic overage charges.
- Limit simultaneous expensive jobs during trial to reduce scripted abuse and accidental burst spend.
- Reserve provider cost before each trial request and deny or downgrade the action before the trial cost ceiling can be exceeded.
- Trial failures should refund the reserved customer allowance where appropriate, while Pie still records the actual provider cost for economics analysis.
- Trial eligibility should be enforced at more than the email-address level where payment-provider and product rules allow, to reduce repeated free-trial abuse.
- Monitor trial cost per started trial, cost per converted trial, conversion rate, fraud/abuse rate, and first-month contribution margin.

### Risk dashboard

Accounting/Data should surface at minimum:

- Revenue by tier
- Direct AI/API cost by tier
- Cost per active subscriber
- Cost per trial started
- Cost per trial converted
- Gross/contribution margin by tier
- Margin at 50%, 80%, and 100% allowance utilization
- Provider/model cost trends
- Failed-generation cost
- Retry cost
- Premium finalization cost
- Marketing-agent compute cost
- Accounts approaching or exceeding internal cost envelopes

Pie should be able to simulate a vendor price increase before changing any customer-facing price or allowance.

## Advertising economics

Actual ad spend should normally be separate from the Pie subscription.

- Subscription: software, agents, campaign management, analytics, automation, and management value.
- Marketing wallet: customer-funded ad budget spent with Meta/Google/TikTok/YouTube/etc.

Pie may offer limited promotional ad credits as an acquisition incentive, but unlimited or large bundled third-party ad spend should not be treated as subscription margin.

## Competitive positioning

Creation message:

> Create music and video competitively with the leading dedicated generators.

Expansion message:

> Then use Pie to release it, market it, book it, manage the audience, run the business, and grow the career.

## Current implementation mismatch to fix

The current code uses fixed action weights such as music/remix = 4 Pie credits and derives monthly included compute directly from career-plan level. That model must be decoupled before launch.

Implementation target:

- Subscription tier controls included creation budget and access.
- Career stage controls workflow guidance/progression.
- Expensive actions use configurable cost weights.
- Every subscription and trial also has an internal USD cost envelope enforced before provider calls.
- Purchased/top-up credits remain a separate prepaid balance and should be allowed to roll over according to the final rollover policy.
- Higher paid tiers can flatten creation while adding agent, marketing, team, and business entitlements.

## Do not change yet without cost calibration

Exact quantities for finished songs, song drafts, video previews, HD renders, voice renders, and included Pie-credit budgets should remain configurable until real provider/API costs are benchmarked and the target gross-margin floor is validated against actual provider usage.
