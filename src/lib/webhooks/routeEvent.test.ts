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
