/**
 * Validates what the rules form submits before it reaches the database.
 *
 * Server Actions are publicly callable, so this is a real trust boundary, not
 * just form politeness -- the DB CHECK constraint would reject a bad trigger
 * anyway, but as a 500 rather than a useful message.
 */

export const TRIGGER_EVENTS = ["order_created", "low_stock", "refund"] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export type RuleInput = {
  triggerEvent: string;
  targetListId: string;
  tag?: string;
};

export type ParsedRule = {
  triggerEvent: TriggerEvent;
  targetListId: string;
  condition: Record<string, string>;
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

  // Only order payloads carry tags, so a tag on any other trigger would be a
  // condition that can never match. Drop it instead of storing a dead rule.
  const tag = input.tag?.trim();
  const condition: Record<string, string> = {};
  if (tag && input.triggerEvent === "order_created") {
    condition.tag = tag;
  }

  return { triggerEvent: input.triggerEvent, targetListId, condition };
}
