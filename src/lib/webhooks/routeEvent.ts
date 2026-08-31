/**
 * Turns a verified Shopify webhook into task-tool tasks.
 *
 * Extracted from the route handler and given injected dependencies so the
 * routing decisions -- which topics act, which rules match, how many tasks get
 * made -- are testable without a database or a live ClickUp workspace.
 */

export type RuleRow = {
  id: string;
  target_list_id: string;
  condition: Record<string, unknown> | null;
};

export type RouteDeps = {
  findClickUpIntegration(
    shopId: string
  ): Promise<{ id: string; access_token: string } | null>;
  findRules(shopId: string, triggerEvent: string): Promise<RuleRow[]>;
  createTask(input: {
    accessToken: string;
    listId: string;
    name: string;
    description: string;
  }): Promise<{ id: string }>;
};

export function mapTopicToTrigger(topic: string): string | null {
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

export function ruleConditionMatches(
  condition: Record<string, unknown> | null,
  payload: Record<string, unknown>
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;

  if (condition.tag && typeof payload.tags === "string") {
    return payload.tags
      .split(",")
      .map((t) => t.trim())
      .includes(condition.tag as string);
  }

  return true;
}

export function buildTaskTitle(
  triggerEvent: string,
  payload: Record<string, unknown>
): string {
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

/**
 * Returns the ids of every task created, so the caller can record them on the
 * sync_events row. Previously the created task was discarded, which left
 * sync_events.created_task_ref null on every successful delivery and made the
 * audit log unable to point at what it had produced.
 */
export async function routeEvent(args: {
  shopId: string;
  topic: string;
  payload: Record<string, unknown>;
  deps: RouteDeps;
}): Promise<string[]> {
  const { shopId, topic, payload, deps } = args;

  const triggerEvent = mapTopicToTrigger(topic);
  if (!triggerEvent) return [];

  const integration = await deps.findClickUpIntegration(shopId);
  if (!integration) return [];

  const rules = await deps.findRules(shopId, triggerEvent);

  const created: string[] = [];
  for (const rule of rules) {
    if (!ruleConditionMatches(rule.condition, payload)) continue;

    const task = await deps.createTask({
      accessToken: integration.access_token,
      listId: rule.target_list_id,
      name: buildTaskTitle(triggerEvent, payload),
      description: JSON.stringify(payload, null, 2),
    });
    created.push(task.id);
  }

  return created;
}
