import { expect, test } from "vitest";
import { routeEvent, mapTopicToTrigger, ruleConditionMatches } from "./routeEvent";
import type { RouteDeps, RuleRow } from "./routeEvent";

const SHOP = "shop-1";

function deps(overrides: Partial<RouteDeps> = {}): RouteDeps & { created: unknown[] } {
  const created: unknown[] = [];
  const base: RouteDeps = {
    async findClickUpIntegration() {
      return { id: "int-1", access_token: "tok" };
    },
    async findRules() {
      return [];
    },
    async createTask(input) {
      created.push(input);
      return { id: "task-" + created.length };
    },
  };
  return Object.assign(base, overrides, { created }) as RouteDeps & { created: unknown[] };
}

const rule = (over: Partial<RuleRow> = {}): RuleRow => ({
  id: "r1",
  target_list_id: "list-1",
  condition: {},
  ...over,
});

test("returns the id of the task it created", async () => {
  const d = deps({ async findRules() { return [rule()]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: { order_number: 1001 },
    deps: d,
  });

  expect(refs).toEqual(["task-1"]);
});

test("creates one task per matching rule", async () => {
  const d = deps({ async findRules() { return [rule({ id: "a" }), rule({ id: "b" })]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: { order_number: 1001 },
    deps: d,
  });

  expect(refs).toEqual(["task-1", "task-2"]);
});

test("creates nothing when the shop has no ClickUp integration", async () => {
  const d = deps({
    async findClickUpIntegration() { return null; },
    async findRules() { return [rule()]; },
  });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: {},
    deps: d,
  });

  expect(refs).toEqual([]);
  expect(d.created).toEqual([]);
});

test("skips a rule whose tag condition does not match the order", async () => {
  const d = deps({ async findRules() { return [rule({ condition: { tag: "wholesale" } })]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: { order_number: 7, tags: "retail, vip" },
    deps: d,
  });

  expect(refs).toEqual([]);
});

test("creates nothing for a topic no trigger maps to", async () => {
  const d = deps({ async findRules() { return [rule()]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/updated",
    payload: {},
    deps: d,
  });

  expect(refs).toEqual([]);
});

test("maps only the topics the app acts on", () => {
  expect(mapTopicToTrigger("orders/create")).toBe("order_created");
  expect(mapTopicToTrigger("refunds/create")).toBe("refund");
  expect(mapTopicToTrigger("inventory_levels/update")).toBe("low_stock");
  expect(mapTopicToTrigger("orders/updated")).toBeNull();
});

test("an empty condition matches everything", () => {
  expect(ruleConditionMatches({}, { tags: "anything" })).toBe(true);
});

test("skips a low_stock rule while stock is still above its threshold", async () => {
  // Without this, every sale fires a "Restock" task, because a sale is just an
  // inventory decrease. Observed in production: order #1002 produced both a
  // pack task and a spurious restock.
  const d = deps({ async findRules() { return [rule({ condition: { below: 5 } })]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "inventory_levels/update",
    payload: { inventory_item_id: 42, available: 9 },
    deps: d,
  });

  expect(refs).toEqual([]);
});

test("creates a low_stock task once stock falls below its threshold", async () => {
  const d = deps({ async findRules() { return [rule({ condition: { below: 5 } })]; } });

  const refs = await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "inventory_levels/update",
    payload: { inventory_item_id: 42, available: 3 },
    deps: d,
  });

  expect(refs).toEqual(["task-1"]);
});

test("assigns the task to the rule's assignee", async () => {
  const d = deps({ async findRules() { return [rule({ assignee: "12345" })]; } });

  await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: { order_number: 1001 },
    deps: d,
  });

  expect(d.created[0]).toMatchObject({ assignees: ["12345"] });
});

test("creates an unassigned task when the rule names no assignee", async () => {
  const d = deps({ async findRules() { return [rule()]; } });

  await routeEvent({
    shopId: SHOP,
    shopDomain: "quickstart-6edde43f.myshopify.com",
    topic: "orders/create",
    payload: { order_number: 1001 },
    deps: d,
  });

  expect(d.created[0]).toMatchObject({ assignees: [] });
});
