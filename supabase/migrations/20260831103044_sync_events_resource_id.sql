-- Lets the app tell whether a given Shopify resource has already been handled,
-- independently of the webhook delivery that carried it.
--
-- sync_events is unique on (shop_id, shopify_webhook_id), which stops a RETRY
-- of one delivery from creating a duplicate task. It cannot answer "has order
-- 1234 been processed at all", because a redelivery of the same order arrives
-- with a different webhook id, and an order recovered by polling has no webhook
-- id whatsoever.
--
-- Without this, a webhook dropped while the endpoint was down is lost for good
-- once Shopify stops retrying. With it, the app can list recent orders from the
-- Admin API, skip the ones already recorded here, and process the rest.

alter table public.sync_events
  add column resource_id text;

comment on column public.sync_events.resource_id is
  'Shopify resource this event concerned (order id, inventory_item_id). Used to detect already-processed resources during reconciliation.';

-- Partial index: only rows carrying a resource_id are ever looked up this way.
create index sync_events_shop_resource_idx
  on public.sync_events (shop_id, resource_id)
  where resource_id is not null;
