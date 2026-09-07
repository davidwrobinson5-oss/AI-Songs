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
- Purchased/top-up credits remain a separate prepaid balance and should be allowed to roll over according to the final rollover policy.
- Higher paid tiers can flatten creation while adding agent, marketing, team, and business entitlements.

## Do not change yet without cost calibration

Exact quantities for finished songs, song drafts, video previews, HD renders, voice renders, and included Pie-credit budgets should remain configurable until real provider/API costs are benchmarked and a target gross-margin floor is selected.
