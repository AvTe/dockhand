-- This mirrors the schema already applied to the live "dockhand" Supabase
-- project (bculzrjiuzaroyoyrecf). Kept here under version control so the
-- schema history lives in git, not just in Supabase's dashboard.

create table shops (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  access_token text not null,
  scope text,
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  provider text not null check (provider in ('clickup', 'monday')),
  access_token text not null,
  refresh_token text,
  workspace_id text,
  workspace_name text,
  connected_at timestamptz not null default now(),
  unique (shop_id, provider)
);

create table rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  integration_id uuid not null references integrations(id) on delete cascade,
  trigger_event text not null check (trigger_event in ('order_created', 'low_stock', 'refund', 'order_tagged')),
  condition jsonb not null default '{}'::jsonb,
  target_list_id text not null,
  assignee text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table sync_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shopify_webhook_id text not null,
  event_type text not null,
  payload jsonb,
  status text not null check (status in ('success', 'failed', 'skipped')),
  created_task_ref text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (shop_id, shopify_webhook_id)
);

create index on integrations (shop_id);
create index on rules (shop_id);
create index on sync_events (shop_id, created_at desc);
