"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveShopId } from "@/lib/shopify/resolveShop";
import { verifySessionToken } from "@/lib/shopify/sessionToken";
import { getProductTitleForInventoryItem, getRecentOrders } from "@/lib/shopify/adminApi";
import { createClickUpTask } from "@/lib/clickup/client";
import { routeEvent, type RouteDeps } from "@/lib/webhooks/routeEvent";
import { reconcileOrders, type ReconcileResult } from "@/lib/webhooks/reconcile";

/**
 * Catches up on orders whose webhook never landed.
 *
 * Shopify gives up retrying a failed delivery after about 48 hours, so an
 * outage silently costs the merchant tasks with nothing to show it happened.
 * This asks Shopify what orders exist, skips the ones sync_events already
 * records, and processes the rest.
 *
 * Each recovered order is written with a synthetic shopify_webhook_id of
 * "reconcile:order:<id>". That reuses the existing unique constraint on
 * (shop_id, shopify_webhook_id), so running this twice cannot double-create a
 * task even if two people click at once.
 */
export async function reconcileNow(sessionToken: string): Promise<ReconcileResult> {
  const { shopDomain } = await verifySessionToken(sessionToken);
  const shopId = await resolveShopId(sessionToken);
  const supabase = getSupabaseAdmin();

  const { data: shop } = await supabase
    .from("shops")
    .select("access_token")
    .eq("id", shopId)
    .single();

  if (!shop) throw new Error("Shop is not installed");
  const accessToken = shop.access_token as string;

  const routeDeps: RouteDeps = {
    async findClickUpIntegration() {
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
    async findRules(_shopId, triggerEvent) {
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
      return getProductTitleForInventoryItem(shopDomain, accessToken, inventoryItemId);
    },
    async createTask({ accessToken: token, listId, name, description, assignees }) {
      const task = await createClickUpTask({
        accessToken: token,
        listId,
        name,
        description,
        assignees,
      });
      return { id: String(task.id) };
    },
  };

  const result = await reconcileOrders({
    shopId,
    deps: {
      async listRecentOrders() {
        return getRecentOrders(shopDomain, accessToken, 25);
      },
      async findProcessedResourceIds(ids) {
        const { data } = await supabase
          .from("sync_events")
          .select("resource_id")
          .eq("shop_id", shopId)
          .in("resource_id", ids);
        return (data ?? []).map((row) => String(row.resource_id));
      },
      async handleOrder(order) {
        const resourceId = String(order.id);

        // Claim the order first. The unique constraint makes this the lock:
        // a concurrent run inserting the same key fails here and does not
        // create a second task.
        const { error: claimError } = await supabase.from("sync_events").insert({
          shop_id: shopId,
          shopify_webhook_id: `reconcile:order:${resourceId}`,
          event_type: "orders/create",
          resource_id: resourceId,
          payload: order,
          status: "success",
        });
        if (claimError) throw new Error(claimError.message);

        const refs = await routeEvent({
          shopId,
          shopDomain,
          topic: "orders/create",
          payload: order,
          deps: routeDeps,
        });

        await supabase
          .from("sync_events")
          .update({ created_task_ref: refs.join(",") || null })
          .eq("shop_id", shopId)
          .eq("shopify_webhook_id", `reconcile:order:${resourceId}`);
      },
    },
  });

  revalidatePath("/");
  return result;
}
