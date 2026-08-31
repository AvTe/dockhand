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
  Schema is already applied live (see `supabase/migrations/` for the SQL, and
  the table descriptions below). Applying further changes needs the Supabase
  CLI linked first — see "Database migrations" under Operating this repo.
- **Vercel team**: "avte's projects" (`team_niLPrV5FNUPXKMNfaJfSb6ev`), Pro
  plan. Not yet connected to this repo — connect it once you're ready to
  deploy (Vercel needs an existing git repo to import, which is why this
  step waited until after the GitHub push).
- **GitHub repo**: https://github.com/AvTe/dockhand (this repo), default branch `main`.
- **Shopify app**: "Dockhand", org "The Aetos", client_id
  `0de0af659b1350f4eac27b0c0d5b97be`, linked via `shopify app config link`.
  Config lives in `shopify.app.toml` — see "Shopify app configuration" below.

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

**Since built (do not re-plan these):**
- OAuth `state` is done. Both callbacks derive the shop from a single-use nonce in `oauth_states`; the `shop_id` query param is gone. See "OAuth state and the auth boundary" below.
- Shop installation is done, via managed install rather than an OAuth redirect. Opening the embedded app verifies the session token, exchanges it for an offline Admin token, and upserts `shops`. There are deliberately no `/api/auth/shopify` routes.

**Still TODO:**
- The webhook handler's `routeEvent()` only checks for a `clickup` integration — no Monday branch yet.
- The 3 mandatory Shopify GDPR compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) — required for Shopify App Store approval, not implemented yet.
- The rules UI — the actual product surface where a merchant sets up "new order → task in Packing." Right now `rules` rows would have to be inserted by hand/SQL.

## Platform-specific facts worth remembering

- **ClickUp**: 100 requests/min rate limit, but it's *per token* — i.e. per connected merchant, not a shared pool, so this doesn't become a scaling bottleneck across customers. Access tokens currently don't expire, but ClickUp's own docs say that's "subject to change" — don't assume it never will.
- **Monday**: GraphQL API, not REST. `create_item` mutation is the equivalent of ClickUp's create-task call.
- **Shopify**: scopes needed are `read_orders`, `read_inventory`, `read_products` (add `write_orders` only if/when building "mark fulfilled back on Shopify"). Webhook topics: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, `inventory_levels/update`.

## Build order (pick up here)

1. ~~Fix the OAuth `state` param issue.~~ Done.
2. ~~Build Shopify app installation flow → populates `shops`.~~ Done (managed install).
3. Build the rules UI → writes to `rules`. Needs App Bridge: the connect-to-ClickUp link must open top-level, since ClickUp's authorize page refuses to be framed.
4. Implement the 3 Shopify compliance webhooks.
5. Add the Monday branch to `routeEvent()`.
6. Connect the repo to Vercel, get a real deployed URL, set `APP_BASE_URL` to it, and update the redirect URIs registered with ClickUp and Monday to match.
7. Submit for Shopify App Store review — budget for at least one rejection-and-fix round, that's normal.
---

# Operating this repo

Everything above is product and business context. Everything below is how to
work in the codebase: the commands, and the decisions that aren't visible
from reading the source.

## Commands

| Command | Notes |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit`. Fastest useful feedback loop — currently passes clean, so any output is a real regression |
| `npm run lint` | `next lint`. Currently passes clean |

There is **no test framework and no `test` script**. That's an unfilled gap,
not a convention to discover the hard way — if you need tests, pick and wire
up a runner deliberately rather than assuming Jest or Vitest is already there.

`.eslintrc.json` (extends `next/core-web-vitals`) exists specifically so
`next lint` runs non-interactively. Don't delete it: with no ESLint config
file, `next lint` drops into a first-run "How would you like to configure
ESLint?" prompt that hangs any non-interactive session.

## Shopify app configuration

The app is created and linked: **Dockhand**, org "The Aetos", client_id
`0de0af659b1350f4eac27b0c0d5b97be`. `shopify.app.toml` is committed and is the
**source of truth** for the client_id, the access scopes and the webhook
subscriptions — the CLI pushes that file to Shopify, so changing scopes means
editing it, not an env var. There is deliberately no `SHOPIFY_SCOPES` variable
for the same reason `SHOPIFY_APP_URL` was removed. `.shopify/` is CLI-local
state and self-ignores.

`shopify.web.toml` exists so `shopify app dev` knows how to start this app
(`npm run dev`). This repo was hand-scaffolded rather than created by
`shopify app init`, so without that file the CLI finds no web component and the
tunnel points at nothing.

To run against a dev store: `shopify app dev`. Because
`build.automatically_update_urls_on_dev = true`, that rewrites `application_url`
and `redirect_urls` in `shopify.app.toml` to the generated tunnel URL. **Set
`APP_BASE_URL` to that same tunnel URL for the session** — otherwise Shopify
points at the tunnel while the ClickUp and Monday OAuth redirects still point at
localhost.

**Don't run `shopify app deploy` yet.** `application_url` and `redirect_urls` are
still the generated `shopify.dev/apps/default-app-home` placeholders; deploying
now would register those as the app's real URLs.

The app is **embedded** (`embedded = true`) — a deliberate choice, since it
renders inside the Shopify admin iframe, which is what App Store review expects
and what Built for Shopify status requires. The consequence is that the rules UI
(build order step 3) needs App Bridge and session-token auth rather than a plain
cookie session, and that `NEXT_PUBLIC_SHOPIFY_API_KEY` is a real runtime need
client-side. The client_id is public, so it's prefilled in `.env.example`;
`SHOPIFY_API_SECRET` is the only genuine Shopify secret and the only Shopify
variable any code reads today.

**Protected Customer Data gates the order and refund topics.** Shopify refuses
webhook subscriptions to topics carrying customer PII until the app is granted
Protected Customer Data access (Partner Dashboard → Apps → Dockhand → API access
→ Protected customer data access). Without it, `shopify app dev` doesn't merely
warn — it fails with "Failed to start dev preview" after logging *"This app is
not approved to subscribe to webhook topics containing protected customer
data."* once per offending topic.

So `[[webhooks.subscriptions]]` currently declares only `inventory_levels/update`,
the one needed topic with no customer data in it. `orders/create` and
`refunds/create` sit commented out in `shopify.app.toml` with a restore note;
uncomment them once access is granted. Note that `orders/updated` and
`orders/cancelled` are deliberately absent even from that commented block —
`mapTopicToTrigger()` returns null for both, so subscribing would deliver events
that no-op. Add a topic here only alongside the code that handles it.

The three mandatory GDPR compliance webhooks are separately still undeclared —
no route handles them, so declaring them would point Shopify at 404s. Build
order step 4.

## Database migrations — how a change actually reaches the live DB

`supabase/migrations/` is real migration history, but it only reaches the live
project through the Supabase CLI, installed here as a devDependency
(`npx supabase`). **One-time setup per machine** — both steps are interactive,
so a coding agent cannot do them for you:

```bash
npx supabase login
npx supabase link --project-ref bculzrjiuzaroyoyrecf
```

After that:

```bash
npx supabase migration new <name>   # creates a correctly-named empty migration
npx supabase migration list         # local files vs. what's applied remotely
npx supabase db push                # apply local migrations not yet on the remote
```

Two properties to preserve:

- **Filenames must stay `<timestamp>_name.sql`.** The CLI parses the leading
  digits as the migration version and matches them against the remote history.
  The first two files were originally `0001_`/`0002_` and were renamed to their
  real remote versions so the two histories line up. A new file hand-named
  `0003_something.sql` would read as an unapplied migration and get re-run
  against a live schema. `migration new` gets the naming right for you.
- **Editing an already-applied migration file does nothing.** The remote tracks
  applied versions; rewriting old SQL in place is a silent no-op. Always add a
  new migration.

Historical note: `20260830110400_init_schema` and
`20260830113406_drop_order_tagged_trigger` were both applied out-of-band (via
dashboard/MCP) before the CLI was linked, then reconciled by renaming. From
here, the CLI is the path.

## Schema values are CHECK-constrained enums

`rules.trigger_event` is `('order_created', 'low_stock', 'refund')` and
`integrations.provider` is `('clickup', 'monday')`, both enforced by CHECK
constraints. Adding a trigger or a third provider is a migration, not just a
code change, and the constraint must be dropped and re-added rather than
altered in place.

`order_tagged` was in that constraint and was removed — see
`20260830113406_drop_order_tagged_trigger.sql` for the full reasoning. Short
version: nothing could ever produce it. Tag routing today is a `condition`
jsonb check inside `order_created`. A genuine `order_tagged` trigger needs the
`orders/updated` topic plus stored prior tag state to diff against, because
Shopify's payload doesn't say what changed.

## OAuth state and the auth boundary

Two separate auth mechanisms, easy to confuse:

**Shopify → us.** `verifySessionToken` in `src/lib/shopify/sessionToken.ts` is the
app's entire auth boundary for embedded requests. Everything downstream trusts
the shop domain it returns. It pins HS256, checks `aud` against the client id,
and requires `iss` and `dest` to name the same shop — the app secret is shared
across every shop that installs, so a valid signature alone does not say which
shop a token is for. It allows 5s of clock skew: Shopify stamps `nbf` with its
own clock, and a machine even ~2s behind (measured, on this one) rejects every
legitimate token with `JWTClaimValidationFailed: "nbf"`.

**Us → ClickUp/Monday.** The authorize routes require an `id_token`, resolve the
shop through `resolveShopId`, and mint a single-use nonce into `oauth_states`
which travels as the OAuth `state`. The callbacks derive the shop *only* from
that nonce. They never read `shop_id` from the query string — doing so let
anyone bind their own ClickUp workspace to another merchant's shop and pipe that
shop's orders into an attacker's board.

Consumption is one conditional `UPDATE ... RETURNING`, deliberately not
`SELECT`-then-`UPDATE`: filters and write land in a single statement, so two
concurrent callbacks replaying one nonce cannot both see it unconsumed. Verified
against the live database — first consume returns the shop, the replay returns
zero rows. `createInMemoryOAuthStateStore` is the reference implementation of
that contract and is what the tests run against; the SQL itself is covered only
by that manual round-trip.

## Running the app locally

`shopify app dev` must be running for the app to load in the Shopify admin at
all. It serves through an ephemeral Cloudflare tunnel, and the admin points at
that tunnel URL, so stopping the dev server makes the app show "server IP
address could not be found". That is the dev server being down, not breakage.

The tunnel hostname changes between sessions. The committed `shopify.app.toml`
keeps the placeholder `shopify.dev/apps/default-app-home` URLs — the CLI updates
the app record on Shopify's side, not the local file — so no machine-specific
tunnel URL should ever be committed. If you see one in a diff, don't.

Don't `rm -rf .next` while the dev server is running: it keeps serving from the
deleted directory and fails with `Cannot find module './276.js'`. Stop it first.

## Supabase clients

`getSupabaseAdmin()` in `src/lib/supabase.ts` uses the **service role key and
bypasses row-level security**. Server-only: importing it into a `"use client"`
component would ship a full-access key to the browser.

There is deliberately **no browser/anon Supabase client yet**, because nothing
user-facing reads from the database.

**RLS is enabled on every table with no policies** (`20260831071345_enable_rls.sql`).
That is the intended state, not an oversight: no policy means anon and
authenticated are denied everything, while the service role bypasses RLS. The
Supabase advisor reports this as INFO ("RLS enabled, no policy") — that INFO is
expected; the ERROR it replaced was not.

Why it mattered: PostgREST exposes the public schema, and before this the anon
key could read `shops.access_token` (a merchant's Shopify Admin API token) and
write to every table. The anon key is `NEXT_PUBLIC_` by design, so it reaches
the browser as soon as any client-side Supabase code exists. Verified after the
fix: anon reads return 0 rows, anon writes return `42501`.

If the rules UI ever needs browser reads, add narrowly-scoped policies — never
turn RLS back off. Re-check with the Supabase advisors after any DDL change.

## Environment

One origin variable: **`APP_BASE_URL`**. It is the Shopify app URL *and* the
base that every OAuth redirect URI is built from (both the ClickUp and Monday
authorize and callback routes). A second `SHOPIFY_APP_URL` used to exist that
no code ever read; it was removed, because two names for one value is exactly
how you set the wrong one in Vercel and get a silently broken redirect.
Whatever it's set to must match the redirect URIs registered in the ClickUp and
Monday developer consoles.

`SUPABASE_SERVICE_ROLE_KEY` is the only value in `.env.example` not pre-filled.
The `NEXT_PUBLIC_*` Supabase values there are real and frontend-safe by design.

## TypeScript

`strict` plus `noUncheckedIndexedAccess`, so indexed access yields
`T | undefined` and needs narrowing. Path alias `@/*` → `src/*`.
