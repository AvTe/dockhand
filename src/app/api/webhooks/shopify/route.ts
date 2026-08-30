import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verifyWebhook";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createClickUpTask } from "@/lib/clickup/client";

/**
 * Single endpoint for all the order/refund/inventory topics we subscribe
 * to (ORDERS_CREATE, ORDERS_UPDATED, ORDERS_CANCELLED, REFUNDS_CREATE,
 * INVENTORY_LEVELS_UPDATE) — Shopify tells us which one via the
 * X-Shopify-Topic header, so we branch on that rather than using a
 * separate route per topic.
 *
 * Two things this MUST do correctly or the whole product breaks quietly:
 *  1. Verify the HMAC signature before trusting anything in the body.
 *  2. Deduplicate by X-Shopify-Webhook-Id — Shopify retries on any
 *     non-2xx response (and sometimes even after a 2xx, rarely), so
 *     without this a flaky ClickUp/Monday call turns into duplicate
 *     tasks for the same order.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const webhookId = req.headers.get("x-shopify-webhook-id");

  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (!topic || !shopDomain || !webhookId) {
    return NextResponse.json({ error: "missing required headers" }, { status: 400 });
  }

  const payload = JSON.parse(rawBody);
  const supabase = getSupabaseAdmin();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id")
    .eq("shop_domain", shopDomain)
    .single();

  if (shopError || !shop) {
    // Shop isn't installed (or was uninstalled) — ack anyway so Shopify
    // stops retrying; there's nothing useful we can do with this event.
    return NextResponse.json({ ok: true, skipped: "unknown shop" });
  }

  // Idempotency guard: (shop_id, shopify_webhook_id) has a unique
  // constraint in the DB, so a duplicate delivery fails this insert and
  // we treat that as "already handled" rather than an error.
  const { error: dedupeError } = await supabase.from("sync_events").insert({
    shop_id: shop.id,
    shopify_webhook_id: webhookId,
    event_type: topic,
    payload,
    status: "success", // optimistic; flipped to "failed" below on error
  });

  if (dedupeError) {
    if (dedupeError.code === "23505") {
      // unique_violation — we've already processed this exact delivery
      return NextResponse.json({ ok: true, skipped: "duplicate delivery" });
    }
    return NextResponse.json({ error: dedupeError.message }, { status: 500 });
  }

  try {
    await routeEvent({ supabase, shopId: shop.id, topic, payload });
  } catch (err) {
    await supabase
      .from("sync_events")
      .update({ status: "failed", error_message: String(err) })
      .eq("shop_id", shop.id)
      .eq("shopify_webhook_id", webhookId);

    // Still return 200: Shopify will retry a 5xx, and retrying won't fix
    // a bad rule or an expired ClickUp token. Surface failures in your
    // own dashboard / logs instead of relying on Shopify's retry loop.
    return NextResponse.json({ ok: true, note: "handled with errors, see sync_events" });
  }

  return NextResponse.json({ ok: true });
}

async function routeEvent(args: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  shopId: string;
  topic: string;
  payload: any;
}) {
  const { supabase, shopId, topic, payload } = args;

  const triggerEvent = mapTopicToTrigger(topic);
  if (!triggerEvent) return; // topic we don't act on (yet)

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("shop_id", shopId)
    .eq("provider", "clickup") // TODO: also branch to monday once that rules UI exists
    .single();

  if (!integration) return; // merchant hasn't connected a task tool yet

  const { data: rules } = await supabase
    .from("rules")
    .select("*")
    .eq("shop_id", shopId)
    .eq("trigger_event", triggerEvent)
    .eq("enabled", true);

  for (const rule of rules ?? []) {
    if (!ruleConditionMatches(rule.condition, payload)) continue;

    await createClickUpTask({
      accessToken: integration.access_token,
      listId: rule.target_list_id,
      name: buildTaskTitle(triggerEvent, payload),
      description: JSON.stringify(payload, null, 2),
    });
  }
}

function mapTopicToTrigger(topic: string): string | null {
  switch (topic) {
    case "orders/create":
      return "order_created";
    case "refunds/create":
      return "refund";
    case "inventory_levels/update":
      return "low_stock";
    default:
      return null;
  }
}

function ruleConditionMatches(condition: Record<string, unknown>, payload: any): boolean {
  // Placeholder matcher — e.g. condition = { tag: "wholesale" } checks
  // payload.tags. Expand this as real rule types get built.
  if (!condition || Object.keys(condition).length === 0) return true;
  if (condition.tag && typeof payload.tags === "string") {
    return payload.tags.split(",").map((t: string) => t.trim()).includes(condition.tag);
  }
  return true;
}

function buildTaskTitle(triggerEvent: string, payload: any): string {
  switch (triggerEvent) {
    case "order_created":
      return `Pack & ship #${payload.order_number ?? payload.id}`;
    case "refund":
      return `Handle refund for order #${payload.order_id}`;
    case "low_stock":
      return `Restock: ${payload.sku ?? payload.inventory_item_id}`;
    default:
      return "New task from Dockhand";
  }
}
