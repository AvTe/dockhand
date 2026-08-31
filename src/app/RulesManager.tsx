"use client";

import { useState, useTransition } from "react";
import { createRule, deleteRule, setRuleEnabled, listListsInSpace } from "./actions/rules";
import { reconcileNow } from "./actions/reconcile";
import { TRIGGER_EVENTS } from "@/lib/rules/ruleInput";
import type { PickableList } from "@/lib/clickup/lists";

export type RuleRow = {
  id: string;
  trigger_event: string;
  target_list_id: string;
  condition: Record<string, unknown> | null;
  assignee: string | null;
  enabled: boolean;
};

const TRIGGER_LABELS: Record<string, string> = {
  order_created: "New order",
  low_stock: "Inventory changed",
  refund: "Refund created",
};

async function sessionToken(): Promise<string> {
  const token = await window.shopify?.idToken();
  if (!token) throw new Error("No session token — open this app from the Shopify admin");
  return token;
}

export function RulesManager({
  rules,
  spaces,
  members,
}: {
  rules: RuleRow[];
  spaces: { id: string; name: string }[];
  members: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<PickableList[]>([]);
  const [trigger, setTrigger] = useState<string>("order_created");
  const [spaceId, setSpaceId] = useState<string>("");
  const [targetListId, setTargetListId] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [threshold, setThreshold] = useState<string>("5");
  const [assignee, setAssignee] = useState<string>("");
  const [recovery, setRecovery] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  async function onSpaceChange(next: string) {
    setSpaceId(next);
    setTargetListId("");
    setLists([]);
    if (!next) return;
    run(async () => {
      setLists(await listListsInSpace(await sessionToken(), next));
    });
  }

  return (
    <>
      {error ? (
        <s-banner heading="Something went wrong" tone="critical">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      ) : null}

      <s-section heading="Missed orders">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Shopify stops retrying a failed webhook after about 48 hours. If Dockhand
            was unreachable when an order came in, that order never became a task.
            This checks the last 25 orders and creates tasks for any that were missed.
          </s-paragraph>
          {recovery ? <s-banner heading="Check complete" tone="info"><s-paragraph>{recovery}</s-paragraph></s-banner> : null}
          <s-button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await reconcileNow(await sessionToken());
                const failed = result.failed?.length ?? 0;
                setRecovery(
                  `Recovered ${result.recovered.length}, already handled ${result.skipped.length}` +
                    (failed > 0 ? `, failed ${failed}` : "")
                );
              })
            }
          >
            Check for missed orders
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Add a rule">
        <s-stack direction="block" gap="base">
          <s-select
            label="When this happens"
            value={trigger}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTrigger(e.target.value)}
          >
            {TRIGGER_EVENTS.map((t) => (
              <s-option key={t} value={t}>
                {TRIGGER_LABELS[t] ?? t}
              </s-option>
            ))}
          </s-select>

          {trigger === "low_stock" ? (
            <s-text-field
              label="Alert when stock falls below"
              value={threshold}
              placeholder="5"
              details="Required. Shopify reports every stock change, including the drop from an ordinary sale, so without a threshold every order would raise a restock task."
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setThreshold(e.target.value)}
            />
          ) : null}

          {trigger === "order_created" ? (
            <s-text-field
              label="Only if the order is tagged (optional)"
              value={tag}
              placeholder="wholesale"
              details="Leave blank to match every new order."
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTag(e.target.value)}
            />
          ) : null}

          <s-select
            label="ClickUp space"
            value={spaceId}
            placeholder="Choose a space"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSpaceChange(e.target.value)}
          >
            {spaces.map((s) => (
              <s-option key={s.id} value={s.id}>
                {s.name}
              </s-option>
            ))}
          </s-select>

          <s-select
            label="Create the task in"
            value={targetListId}
            placeholder={spaceId ? "Choose a list" : "Choose a space first"}
            disabled={!spaceId || lists.length === 0}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setTargetListId(e.target.value)
            }
          >
            {lists.map((l) => (
              <s-option key={l.id} value={l.id}>
                {l.label}
              </s-option>
            ))}
          </s-select>

          <s-select
            label="Assign to"
            value={assignee}
            placeholder="Nobody (task will not notify anyone)"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAssignee(e.target.value)}
          >
            <s-option value="">Nobody</s-option>
            {members.map((m) => (
              <s-option key={m.id} value={m.id}>
                {m.name}
              </s-option>
            ))}
          </s-select>

          <s-button
            variant="primary"
            disabled={pending || !targetListId}
            onClick={() =>
              run(async () => {
                await createRule(await sessionToken(), {
                  triggerEvent: trigger,
                  targetListId,
                  tag,
                  threshold,
                  assignee,
                });
                setTargetListId("");
                setTag("");
              })
            }
          >
            Add rule
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading={`Rules (${rules.length})`}>
        {rules.length === 0 ? (
          <s-paragraph tone="subdued">
            No rules yet. Add one above and Dockhand will start creating tasks.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {rules.map((rule) => (
              <s-box key={rule.id} padding="base" background="subdued" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text type="strong">
                    {TRIGGER_LABELS[rule.trigger_event] ?? rule.trigger_event}
                  </s-text>
                  {rule.condition && typeof rule.condition.tag === "string" ? (
                    <s-badge tone="info">tag: {rule.condition.tag}</s-badge>
                  ) : null}
                  {rule.condition && typeof rule.condition.below === "number" ? (
                    <s-badge tone="info">below {rule.condition.below}</s-badge>
                  ) : null}
                  <s-badge tone={rule.assignee ? "info" : "warning"}>
                    {rule.assignee
                      ? (members.find((m) => m.id === rule.assignee)?.name ?? "assigned")
                      : "unassigned"}
                  </s-badge>
                  <s-badge tone={rule.enabled ? "success" : "neutral"}>
                    {rule.enabled ? "Enabled" : "Paused"}
                  </s-badge>
                  <s-text tone="subdued">list {rule.target_list_id}</s-text>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <s-button
                    disabled={pending}
                    onClick={() =>
                      run(async () =>
                        setRuleEnabled(await sessionToken(), rule.id, !rule.enabled)
                      )
                    }
                  >
                    {rule.enabled ? "Pause" : "Enable"}
                  </s-button>
                  <s-button
                    tone="critical"
                    disabled={pending}
                    onClick={() => run(async () => deleteRule(await sessionToken(), rule.id))}
                  >
                    Delete
                  </s-button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </>
  );
}
