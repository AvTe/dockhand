import { afterEach, expect, test, vi } from "vitest";
import { getProductTitleForInventoryItem, getRecentOrders } from "./adminApi";

const SHOP = "quickstart-6edde43f.myshopify.com";

afterEach(() => vi.unstubAllGlobals());

function stubGraphql(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: { body?: unknown }) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

test("resolves the product title behind an inventory item", async () => {
  const calls = stubGraphql(200, {
    data: { inventoryItem: { variant: { product: { title: "Red T-shirt printed" } } } },
  });

  const title = await getProductTitleForInventoryItem(SHOP, "tok", 42260976435329);

  expect(title).toBe("Red T-shirt printed");
  expect(calls[0]?.body.variables).toEqual({
    id: "gid://shopify/InventoryItem/42260976435329",
  });
});

test("returns null when the item has no product", async () => {
  stubGraphql(200, { data: { inventoryItem: null } });

  await expect(
    getProductTitleForInventoryItem(SHOP, "tok", 1)
  ).resolves.toBeNull();
});

test("returns null rather than throwing when the lookup fails", async () => {
  // A restock task with an ugly title is better than no task at all, so a
  // failed lookup must not abort the webhook.
  stubGraphql(401, { errors: [{ message: "unauthorized" }] });

  await expect(
    getProductTitleForInventoryItem(SHOP, "tok", 1)
  ).resolves.toBeNull();
});

test("lists recent orders for reconciliation", async () => {
  const calls = stubGraphql(200, {
    data: {
      orders: {
        nodes: [
          { id: "gid://shopify/Order/111", name: "#1001", createdAt: "2026-08-31T10:00:00Z" },
        ],
      },
    },
  });

  const orders = await getRecentOrders(SHOP, "tok", 10);

  expect(orders).toHaveLength(1);
  // Reconciliation matches against sync_events.resource_id, which holds the
  // numeric id the webhook payload carries -- not the gid.
  expect(orders[0]?.id).toBe("111");
  expect(String(calls[0]?.body.query)).toContain("orders");
});

test("returns an empty list rather than throwing when orders cannot be fetched", async () => {
  stubGraphql(500, { errors: [{ message: "boom" }] });

  await expect(getRecentOrders(SHOP, "tok", 10)).resolves.toEqual([]);
});
