# Dockhand

Turns Shopify orders, low-stock alerts, and refunds into ClickUp or Monday tasks automatically. "Dockhand" is a working name — rename before launch if you land on something else.

## What's already done

- Next.js + TypeScript + Tailwind app scaffold.
- Supabase project **already provisioned** (free tier, project `dockhand`, region `ap-south-1`) with the schema below applied and live.
- Route skeletons for the Shopify webhook handler, and OAuth flows for ClickUp and Monday.

## Architecture, in one paragraph

A merchant installs the Shopify app, which stores a row in `shops`. They then connect ClickUp and/or Monday via OAuth (`integrations` table), and define rules ("new order → task in Packing", stored in `rules`). Shopify calls our webhook on every order/refund/inventory event; we look up the merchant's rules, check conditions, and create the matching task via the ClickUp or Monday API. `sync_events` logs every webhook delivery by its unique ID so a retried delivery never creates a duplicate task.

## Database schema (already live in Supabase)

| Table | Purpose |
|---|---|
| `shops` | One row per installed Shopify store, holds the Shopify Admin API token |
| `integrations` | One row per (shop, provider) — the ClickUp or Monday OAuth token for that shop |
| `rules` | The merchant's routing rules: which event, which condition, which list/board to create a task in |
| `sync_events` | Idempotency + audit log, keyed on `(shop_id, shopify_webhook_id)` |

The SQL is also checked into `supabase/migrations/0001_init_schema.sql` so schema history lives in git.

## Setup checklist — what I need from you

None of these can be created on your behalf — they all require your own accounts/business identity. Do them in roughly this order:

### 1. Get the code onto your machine
```bash
git clone <the repo URL, once you've pushed it — see below>
cd dockhand
npm install
cp .env.example .env.local
```

### 2. Get the Supabase service role key
The project already exists. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → project `dockhand` → **Project Settings → API** → copy the **service_role** key (NOT the anon key, that's already filled into `.env.example`) into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. Never commit this key or paste it into chat.

### 3. Create a Shopify Partner account + app (if you don't have one already)
- [partners.shopify.com](https://partners.shopify.com) → free account.
- Create a new app, get your `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`.
- Scopes needed: `read_orders`, `read_inventory`, `read_products`.
- Webhook topics to subscribe: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, `inventory_levels/update`.
- You'll also need to implement the 3 mandatory GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) before Shopify will approve the app for the public App Store — not in this scaffold yet, flagged here so it doesn't surprise you at review time.
- Create a development store under your Partner account to test against.

### 4. Create a ClickUp OAuth app
- Log into ClickUp → **Settings → Apps → Create new app**.
- Redirect URL (for local dev): `http://localhost:3000/api/auth/clickup/callback`
- Copy the `client_id` / `client_secret` into `.env.local`.
- No approval process, no marketplace listing needed — this just works once you plug in the keys.

### 5. Create a monday.com OAuth app
- [monday.com Developer Center](https://developer.monday.com) → create an app.
- Redirect URL: `http://localhost:3000/api/auth/monday/callback`
- Copy the `client_id` / `client_secret` into `.env.local`.
- **Deliberately not listing this in monday's marketplace** — their marketplace requires apps to be monetized through monday's own billing, which would stack a second revenue cut on top of Shopify's. A private OAuth app skips that; you lose monday-side discovery but keep your own billing.

### 6. Push to GitHub
```bash
git remote add origin <your empty GitHub repo URL>
git push -u origin main
```

### 7. Connect Vercel
Once the repo is on GitHub, import it in Vercel (or ask me to do it via the Vercel MCP tools in a future session — I can only do this after step 6, since Vercel needs a real git repo to import). Add all the `.env.local` values as Vercel environment variables, then `SHOPIFY_APP_URL` / `APP_BASE_URL` become your real Vercel URL instead of `localhost:3000`.

## Build order from here

1. Wire up Shopify app installation (OAuth into `shops` table) — not built yet, the scaffold assumes a shop row already exists.
2. Add a `state` param to both OAuth callbacks to tie the redirect back to the right shop — the callback routes have a `// TODO` marking exactly where.
3. Build the rules UI (the actual product) — a form that writes rows into `rules`.
4. Implement the 3 Shopify GDPR compliance webhooks.
5. Add the Monday branch to `routeEvent()` in the webhook handler — right now it only checks for a ClickUp integration.
