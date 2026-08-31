/**
 * Keeps an existing task in step with its order.
 *
 * Dockhand creates a task when an order arrives and, until now, never touched
 * it again -- so a task said "Placed" forever, even after the order shipped or
 * was cancelled. This posts a comment on the task instead of creating a new
 * one.
 *
 * A comment rather than a status move is deliberate: ClickUp statuses are
 * custom per list, so moving a task requires a per-rule mapping that silently
 * breaks on any list whose statuses differ. A comment works on every list, and
 * ClickUp notifies assignees and watchers about it.
 */

export type OrderUpdateDeps = {
  /** ClickUp task ids previously created for this order. */
  findTaskRefsForOrder(shopId: string, orderId: string): Promise<string[]>;
  addComment(taskId: string, text: string): Promise<void>;
};

/** Human-readable description of what changed, or null if the topic is not a status change. */
export function describeStatusChange(
  topic: string,
  payload: Record<string, unknown>
): string | null {
  const order = payload.order_number ? ` #${payload.order_number}` : "";

  switch (topic) {
    case "orders/fulfilled":
      return `Order${order} was fulfilled in Shopify.`;
    case "orders/cancelled":
      return `Order${order} was cancelled in Shopify.`;
    case "orders/paid":
      return `Payment received for order${order} in Shopify.`;
    default:
      return null;
  }
}

/** Returns the ids of the tasks commented on. */
export async function routeOrderUpdate(args: {
  shopId: string;
  topic: string;
  payload: Record<string, unknown>;
  deps: OrderUpdateDeps;
}): Promise<string[]> {
  const { shopId, topic, payload, deps } = args;

  const text = describeStatusChange(topic, payload);
  if (!text) return [];

  const orderId = payload.id;
  if (orderId === undefined || orderId === null) return [];

  const taskRefs = await deps.findTaskRefsForOrder(shopId, String(orderId));

  const commented: string[] = [];
  for (const taskId of taskRefs) {
    await deps.addComment(taskId, text);
    commented.push(taskId);
  }

  return commented;
}
