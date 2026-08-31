import { expect, test } from "vitest";
import { reconcileOrders, type ReconcileDeps } from "./reconcile";

const SHOP = "shop-1";

function deps(overrides: Partial<ReconcileDeps> = {}) {
  const handled: string[] = [];
  const base: ReconcileDeps = {
    async listRecentOrders() {
      return [];
    },
    async findProcessedResourceIds() {
      return [];
    },
    async handleOrder(order) {
      handled.push(String(order.id));
    },
  };
  return Object.assign(base, overrides, { handled });
}

test("processes an order that was never recorded", async () => {
  const d = deps({
    async listRecentOrders() {
      return [{ id: 111, order_number: 1001 }];
    },
  });

  const result = await reconcileOrders({ shopId: SHOP, deps: d });

  expect(d.handled).toEqual(["111"]);
  expect(result).toEqual({ recovered: ["111"], skipped: [] });
});

test("skips an order the webhook already handled", async () => {
  const d = deps({
    async listRecentOrders() {
      return [{ id: 111 }, { id: 222 }];
    },
    async findProcessedResourceIds() {
      return ["111"];
    },
  });

  const result = await reconcileOrders({ shopId: SHOP, deps: d });

  expect(d.handled).toEqual(["222"]);
  expect(result).toEqual({ recovered: ["222"], skipped: ["111"] });
});

test("recovers nothing when every order is already recorded", async () => {
  const d = deps({
    async listRecentOrders() {
      return [{ id: 111 }];
    },
    async findProcessedResourceIds() {
      return ["111"];
    },
  });

  await expect(reconcileOrders({ shopId: SHOP, deps: d })).resolves.toEqual({
    recovered: [],
    skipped: ["111"],
  });
  expect(d.handled).toEqual([]);
});

test("keeps going when one order fails to process", async () => {
  // One bad order must not strand every later one.
  const d = deps({
    async listRecentOrders() {
      return [{ id: 111 }, { id: 222 }];
    },
    async handleOrder(order) {
      if (String(order.id) === "111") throw new Error("ClickUp rejected it");
      (d as unknown as { handled: string[] }).handled.push(String(order.id));
    },
  });

  const result = await reconcileOrders({ shopId: SHOP, deps: d });

  expect(result.recovered).toEqual(["222"]);
  expect(result.failed).toEqual(["111"]);
});

test("returns empty rather than throwing when Shopify cannot be reached", async () => {
  const d = deps({
    async listRecentOrders() {
      throw new Error("Admin API down");
    },
  });

  await expect(reconcileOrders({ shopId: SHOP, deps: d })).resolves.toMatchObject({
    recovered: [],
  });
});
