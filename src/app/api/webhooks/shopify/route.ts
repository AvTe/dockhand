import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/verifyWebhook";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createClickUpTask } from "@/lib/clickup/client";
import { routeEvent, type RouteDeps } from "@/lib/webhooks/routeEvent";
import { getProductTitleForInventoryItem } from "@/lib/shopify/adminApi";

/**
 * Single endpoint for every topic we subscribe to -- Shopify names the topic in
 * the X-Shopify-Topic header, so this branches on that rather than using a
 * route per topic.
 *
 * Two things this MUST do correctly or the product breaks quietly:
 *  1. Verify the HMAC before trusting anything in the body.
 *  2. Deduplicate by X-Shopify-Webhook-Id. Shopify retries on any non-2xx, so
 *     without this a flaky ClickUp call turns into duplicate tasks.
 *
 * The routing decisions live in @/lib/webhooks/routeEvent, which is tested.
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

  // Which Shopify resource this concerned, so reconciliation can later tell
  // whether an order was ever handled. The webhook id cannot answer that: a
  // redelivery carries a different one, and a recovered order has none.
  const resourceId =
    payload.id !== undefined
      ? String(payload.id)
      : payload.inventory_item_id !== undefined
        ? String(payload.inventory_item_id)
        : null;
  const supabase = getSupabaseAdmin();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, access_token")
    .eq("shop_domain", shopDomain)
    .single();

  if (shopError || !shop) {
    // Not installed, or uninstalled. Ack so Shopify stops retrying: there is
    // nothing useful to do with this event.
    return NextResponse.json({ ok: true, skipped: "unknown shop" });
  }

  // Idempotency guard: (shop_id, shopify_webhook_id) is unique in the DB, so a
  // duplicate delivery fails this insert and we treat that as already handled.
  const { error: dedupeError } = await supabase.from("sync_events").insert({
    shop_id: shop.id,
    shopify_webhook_id: webhookId,
    event_type: topic,
    resource_id: resourceId,
    payload,
    status: "success", // optimistic; corrected below
  });

  if (dedupeError) {
    if (dedupeError.code === "23505") {
      return NextResponse.json({ ok: true, skipped: "duplicate delivery" });
    }
    return NextResponse.json({ error: dedupeError.message }, { status: 500 });
  }

  const deps: RouteDeps = {
    async findClickUpIntegration(shopId) {
      const { data } = await supabase
        .from("integrations")
        .select("id, access_token")
        .eq("shop_id", shopId)
        .eq("provider", "clickup")
        .maybeSingle();
      return data
        ? { id: data.id as string, access_token: data.access_token as string }
        : null;
    },
    async findRules(shopId, triggerEvent) {
      const { data } = await supabase
        .from("rules")
        .select("id, target_list_id, condition, assignee")
        .eq("shop_id", shopId)
        .eq("trigger_event", triggerEvent)
        .eq("enabled", true);
      return (data ?? []) as {
        id: string;
        target_list_id: string;
        condition: Record<string, unknown> | null;
        assignee: string | null;
      }[];
    },
    async resolveProductTitle(inventoryItemId) {
      return getProductTitleForInventoryItem(
        shopDomain,
        shop.access_token as string,
        inventoryItemId
      );
    },
    async createTask({ accessToken, listId, name, description, assignees }) {
      const task = await createClickUpTask({ accessToken, listId, name, description, assignees });
      return { id: String(task.id) };
    },
  };

  try {
    const createdTaskRefs = await routeEvent({
      shopId: shop.id,
      shopDomain,
      topic,
      payload,
      deps,
    });

    // Record what this delivery actually produced. Without it the audit log
    // says "success" but cannot point at the task it made.
    if (createdTaskRefs.length > 0) {
      await supabase
        .from("sync_events")
        .update({ created_task_ref: createdTaskRefs.join(",") })
        .eq("shop_id", shop.id)
        .eq("shopify_webhook_id", webhookId);
    }

    return NextResponse.json({ ok: true, created: createdTaskRefs });
  } catch (err) {
    await supabase
      .from("sync_events")
      .update({ status: "failed", error_message: String(err) })
      .eq("shop_id", shop.id)
      .eq("shopify_webhook_id", webhookId);

    // Still 200: Shopify retries a 5xx, and retrying will not fix a bad rule or
    // an expired token. Failures surface in sync_events, not in Shopify's
    // retry loop.
    return NextResponse.json({ ok: true, note: "handled with errors, see sync_events" });
  }
}
