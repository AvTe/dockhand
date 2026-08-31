/**
 * Recovers orders whose webhook never landed.
 *
 * Shopify retries a failed delivery for about 48 hours and then gives up. Any
 * order that arrived while the endpoint was down -- a bad deploy, an expired
 * tunnel, a crashed dev server -- is otherwise lost permanently, with no task
 * and no record that anything was missed.
 *
 * This closes that hole by asking Shopify what orders exist, comparing against
 * what sync_events already recorded, and processing the difference. It is safe
 * to run repeatedly: anything already recorded is skipped.
 */

export type ReconcileDeps = {
  /** Recent orders from the Admin API, newest first. */
  listRecentOrders(): Promise<Record<string, unknown>[]>;
  /** Of these resource ids, which already have a sync_events row. */
  findProcessedResourceIds(ids: string[]): Promise<string[]>;
  /** Route one order exactly as the webhook handler would. */
  handleOrder(order: Record<string, unknown>): Promise<void>;
};

export type ReconcileResult = {
  recovered: string[];
  skipped: string[];
  failed?: string[];
};

export async function reconcileOrders(args: {
  shopId: string;
  deps: ReconcileDeps;
}): Promise<ReconcileResult> {
  const { deps } = args;

  let orders: Record<string, unknown>[];
  try {
    orders = await deps.listRecentOrders();
  } catch {
    // Reconciliation is a safety net, never the thing that breaks a page load.
    return { recovered: [], skipped: [] };
  }

  const ids = orders.map((o) => String(o.id));
  if (ids.length === 0) return { recovered: [], skipped: [] };

  const processed = new Set(await deps.findProcessedResourceIds(ids));

  const recovered: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const order of orders) {
    const id = String(order.id);
    if (processed.has(id)) {
      skipped.push(id);
      continue;
    }

    try {
      await deps.handleOrder(order);
      recovered.push(id);
    } catch {
      // One unprocessable order must not strand every later one.
      failed.push(id);
    }
  }

  return failed.length > 0
    ? { recovered, skipped, failed }
    : { recovered, skipped };
}
