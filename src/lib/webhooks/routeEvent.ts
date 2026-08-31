import { buildTaskBody } from "./taskBody";

/**
 * Turns a verified Shopify webhook into task-tool tasks.
 *
 * Dependencies are injected so the routing decisions -- which topics act, which
 * rules match, how many tasks get made, who they land on -- are testable
 * without a database or a live ClickUp workspace.
 */

export type RuleRow = {
  id: string;
  target_list_id: string;
  condition: Record<string, unknown> | null;
  assignee?: string | null;
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
    assignees: string[];
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

  // Stock threshold. Shopify sends inventory_levels/update on ANY change,
  // including the decrease caused by a sale, so without a threshold every
  // order also produces a "Restock" task.
  if (condition.below !== undefined) {
    const below = Number(condition.below);
    const available = Number(payload.available);
    if (!Number.isFinite(below) || !Number.isFinite(available)) return false;
    if (available >= below) return false;
  }

  if (condition.tag && typeof payload.tags === "string") {
    const tags = payload.tags.split(",").map((t) => t.trim());
    if (!tags.includes(condition.tag as string)) return false;
  }

  return true;
}

/**
 * Returns the ids of every task created, so the caller can record them on the
 * sync_events row.
 */
export async function routeEvent(args: {
  shopId: string;
  shopDomain: string;
  topic: string;
  payload: Record<string, unknown>;
  deps: RouteDeps;
}): Promise<string[]> {
  const { shopId, shopDomain, topic, payload, deps } = args;

  const triggerEvent = mapTopicToTrigger(topic);
  if (!triggerEvent) return [];

  const integration = await deps.findClickUpIntegration(shopId);
  if (!integration) return [];

  const rules = await deps.findRules(shopId, triggerEvent);

  const created: string[] = [];
  for (const rule of rules) {
    if (!ruleConditionMatches(rule.condition, payload)) continue;

    const { name, description } = buildTaskBody(triggerEvent, payload, shopDomain);

    const task = await deps.createTask({
      accessToken: integration.access_token,
      listId: rule.target_list_id,
      name,
      description,
      assignees: rule.assignee ? [rule.assignee] : [],
    });
    created.push(task.id);
  }

  return created;
}
