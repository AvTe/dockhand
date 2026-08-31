import { afterEach, expect, test, vi } from "vitest";
import { getProductTitleForInventoryItem } from "./adminApi";

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
