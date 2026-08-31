/**
 * Validates what the rules form submits before it reaches the database.
 *
 * Server Actions are publicly callable, so this is a real trust boundary, not
 * just form politeness.
 */

export const TRIGGER_EVENTS = ["order_created", "low_stock", "refund"] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export type RuleInput = {
  triggerEvent: string;
  targetListId: string;
  tag?: string;
  threshold?: string;
  assignee?: string;
};

export type ParsedRule = {
  triggerEvent: TriggerEvent;
  targetListId: string;
  condition: Record<string, string | number>;
  assignee: string | null;
};

function isTriggerEvent(value: string): value is TriggerEvent {
  return (TRIGGER_EVENTS as readonly string[]).includes(value);
}

export function parseRuleInput(input: RuleInput): ParsedRule {
  if (!isTriggerEvent(input.triggerEvent)) {
    throw new Error(
      `Unknown trigger "${input.triggerEvent}". Expected one of: ${TRIGGER_EVENTS.join(", ")}`
    );
  }

  const targetListId = input.targetListId.trim();
  if (!targetListId) {
    throw new Error("Pick a ClickUp list for this rule");
  }

  const condition: Record<string, string | number> = {};

  // Only order payloads carry tags, so a tag on any other trigger would be a
  // condition that can never match. Drop it instead of storing a dead rule.
  const tag = input.tag?.trim();
  if (tag && input.triggerEvent === "order_created") {
    condition.tag = tag;
  }

  // A low_stock rule without a threshold fires on every inventory change,
  // including the decrease an ordinary sale causes, so it is required.
  if (input.triggerEvent === "low_stock") {
    const raw = input.threshold?.trim();
    if (!raw) {
      throw new Error("Set the stock level to alert below, or every sale will raise a restock task");
    }
    const below = Number(raw);
    if (!Number.isFinite(below) || below <= 0) {
      throw new Error("The stock threshold must be a positive number");
    }
    condition.below = below;
  }

  const assignee = input.assignee?.trim();

  return {
    triggerEvent: input.triggerEvent,
    targetListId,
    condition,
    assignee: assignee ? assignee : null,
  };
}
