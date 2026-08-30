-- Drops 'order_tagged' from the rules.trigger_event CHECK constraint.
--
-- It was in the original constraint but unreachable: mapTopicToTrigger()
-- in src/app/api/webhooks/shopify/route.ts never produces it, so no rule
-- row using it could ever fire. The tag-based routing that actually works
-- today is a `condition` jsonb check (e.g. {"tag": "wholesale"}) evaluated
-- inside the 'order_created' trigger.
--
-- A genuine 'order_tagged' trigger means subscribing to orders/updated and
-- diffing tags against their previous value, since Shopify's payload does
-- not say what changed -- that needs prior-state storage and is a feature,
-- not a constraint entry. Re-add this value in the migration that builds it.
--
-- Safe at time of writing: rules was empty (0 rows), so nothing to backfill.

alter table public.rules
  drop constraint rules_trigger_event_check;

alter table public.rules
  add constraint rules_trigger_event_check
  check (trigger_event in ('order_created', 'low_stock', 'refund'));
