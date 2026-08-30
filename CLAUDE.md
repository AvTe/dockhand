# Dockhand — project context for Claude Code

Read this before making changes. It's the context that would otherwise only
live in a chat history you don't have access to. If anything here looks
out of date with the actual code, trust the code and flag the mismatch to
the person you're working with — don't silently assume this file wins.

## What this is

Dockhand watches a Shopify store and automatically creates the matching
ClickUp or Monday.com task when something needs doing: a new order to
pack, stock to reorder, a refund to handle. The pitch is "no Zapier
subscription, no copy-pasting order details by hand."

"Dockhand" is a working name chosen for a validation landing page — treat
it as provisional, not a locked brand decision.

## Why this idea (the validation behind it, so nobody re-litigates it from scratch)

- ClickUp's own feature-request board has **212 upvotes** on "add a
  Shopify integration," open since 2020, still unresolved natively —
  https://feedback.clickup.com/integrations/p/shopify
- The one competing app on the Shopify App Store, "ClickUp Sync – Orders
  to Tasks," is brand new (launched July 2026), has zero reviews, and only
  does one-way order→task sync (no inventory alerts, no tag-based
  routing, no delivery/route use cases — all things people on that
  feedback thread explicitly asked for).
- Shopify's own free "monday.com Connector" app has zero reviews despite
  being live — proof that even a free, first-party-adjacent option hasn't
  cracked adoption here.
- The equivalent app for **Airtable** ("AirPower sync") is doing well: 4.8
  stars across 64 reviews, main complaint is just "kind of pricy" — proof
  merchants pay well for this category once the sync is actually good.
  This is *why we're not building for Airtable* — that niche is already
  served. ClickUp and Monday are the open ones.
- Target audience is deliberately **outside India**: Shopify merchants
  skew ~55% US, then UK/Germany/Australia/Canada. ClickUp and Monday also
  skew hard to that same audience.
- Caveat to keep in mind: the strongest single piece of evidence is that
  one 212-upvote thread. It's real signal, not five independent sources
  all screaming demand — the actual validation instrument is the waitlist
  landing page (see below), not this bullet list.

## Validation landing page

Published as a Claude Artifact (not part of this repo — it's a
self-contained HTML page with its own signup-storage mechanism, not
Next.js code): https://claude.ai/code/artifact/262273dc-b8a2-4d57-8919-3f555103ac03

It collects: email, which tool the team uses (ClickUp / Monday / Airtable
/ other), and rough order volume. Check it periodically for real signups
before sinking more build time into features nobody's asked for yet.

## Business model decisions already made

- **Shopify App Store subscription** via Shopify's own Billing API.
  Reference pricing point: the one competing app ("ClickUp Sync") charges
  free up to 20 orders/month, $9/mo for 300 orders, $29/mo unlimited —
  matched that shape as a starting point, expect to differentiate on
  price once two-way sync + inventory alerts are live (AirPower's "kind
  of pricy" complaint at 4.8 stars proves people tolerate a premium here).
- **ClickUp integration ships first.** Least competition, zero
  marketplace-listing requirement, simplest API (REST, not GraphQL).
- **Monday integration ships second**, and deliberately as a **private,
  unlisted OAuth app** — NOT published to monday's official app
  marketplace. Reason: monday's marketplace requires apps to be
  monetized through monday's own billing system, which would stack a
  second revenue cut on top of what Shopify's App Store already takes.
  A private OAuth app (create it in monday's Developer Center, don't
  submit it for marketplace listing) skips that entirely — you lose
  monday-side discovery, keep 100% of the subscription revenue.
- **Airtable: explicitly out of scope** — already well-served by AirPower.

## Infrastructure already provisioned (don't recreate these)

- **Supabase project**: name `dockhand`, project ref `bculzrjiuzaroyoyrecf`,
  org "Amit" (`tsfjzjicpmlslbtkaqja`), region `ap-south-1`, free tier.
  Schema is already applied live (see `supabase/migrations/0001_init_schema.sql`
  for the SQL, and the table descriptions below).
- **Vercel team**: "avte's projects" (`team_niLPrV5FNUPXKMNfaJfSb6ev`), Pro
  plan. Not yet connected to this repo — connect it once you're ready to
  deploy (Vercel needs an existing git repo to import, which is why this
  step waited until after the GitHub push).
- **GitHub repo**: https://github.com/AvTe/dockhand (this repo).

## Database schema

| Table | Purpose |
|---|---|
| `shops` | One row per installed Shopify store; holds the Shopify Admin API access token |
| `integrations` | One row per (shop, provider); holds the ClickUp or Monday OAuth token for that shop. Unique on `(shop_id, provider)` |
| `rules` | Merchant's routing rules: which trigger event, which condition (jsonb), which list/board ID to create a task in |
| `sync_events` | Idempotency + audit log. Unique on `(shop_id, shopify_webhook_id)` — this is what stops a retried Shopify webhook delivery from creating a duplicate task |

## What's built vs. what's stubbed

**Actually functional:**
- `src/lib/shopify/verifyWebhook.ts` — real HMAC-SHA256 verification, constant-time compare.
- `src/app/api/webhooks/shopify/route.ts` — real dedup logic against `sync_events` (relies on the DB unique constraint, not application-level locking, so it's race-safe), real routing from Shopify topic → trigger event → matching rules → ClickUp task creation.
- Supabase schema — live, not just sketched.

**Deliberately left as TODOs (marked in code with `// TODO`):**
- OAuth `state` param verification in both `/api/auth/clickup/callback` and `/api/auth/monday/callback` — right now the callback trusts a `shop_id` query param with no signature tying it back to a real session. **Do not ship OAuth to production without fixing this** — it's a real account-takeover vector as written.
- The webhook handler's `routeEvent()` only checks for a `clickup` integration — no Monday branch yet.
- Shop installation itself (the Shopify OAuth flow that populates the `shops` table) isn't built — the whole app currently assumes a `shops` row already exists.
- The 3 mandatory Shopify GDPR compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) — required for Shopify App Store approval, not implemented yet.
- The rules UI — the actual product surface where a merchant sets up "new order → task in Packing." Right now `rules` rows would have to be inserted by hand/SQL.

## Platform-specific facts worth remembering

- **ClickUp**: 100 requests/min rate limit, but it's *per token* — i.e. per connected merchant, not a shared pool, so this doesn't become a scaling bottleneck across customers. Access tokens currently don't expire, but ClickUp's own docs say that's "subject to change" — don't assume it never will.
- **Monday**: GraphQL API, not REST. `create_item` mutation is the equivalent of ClickUp's create-task call.
- **Shopify**: scopes needed are `read_orders`, `read_inventory`, `read_products` (add `write_orders` only if/when building "mark fulfilled back on Shopify"). Webhook topics: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, `inventory_levels/update`.

## Build order (pick up here)

1. Fix the OAuth `state` param issue (security, not optional).
2. Build Shopify app installation flow → populates `shops`.
3. Build the rules UI → writes to `rules`.
4. Implement the 3 Shopify compliance webhooks.
5. Add the Monday branch to `routeEvent()`.
6. Connect the repo to Vercel, get a real deployed URL, update `SHOPIFY_APP_URL`/`APP_BASE_URL`.
7. Submit for Shopify App Store review — budget for at least one rejection-and-fix round, that's normal.