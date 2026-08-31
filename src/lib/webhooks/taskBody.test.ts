import { expect, test } from "vitest";
import { buildTaskBody } from "./taskBody";

const SHOP = "quickstart-6edde43f.myshopify.com";

const order = {
  id: 4767924322433,
  order_number: 1003,
  total_price: "1532.82",
  currency: "INR",
  financial_status: "pending",
  line_items: [
    { title: "Blue T-Shirt", quantity: 2, sku: "TSHIRT-BLUE-M" },
    { title: "Cap", quantity: 1, sku: null },
  ],
  shipping_address: { country: "India" },
};

test("names an order task after its order number", () => {
  expect(buildTaskBody("order_created", order, SHOP).name).toBe("Pack & ship #1003");
});

test("lists what was ordered, with quantities", () => {
  const { description } = buildTaskBody("order_created", order, SHOP);

  expect(description).toContain("2 x Blue T-Shirt");
  expect(description).toContain("TSHIRT-BLUE-M");
  expect(description).toContain("1 x Cap");
});

test("shows the order total with its currency", () => {
  expect(buildTaskBody("order_created", order, SHOP).description).toContain("1532.82 INR");
});

test("deep links back to the order in the Shopify admin", () => {
  // The customer's name, email and address are redacted by Shopify, so the
  // task carries a link rather than copies of personal data.
  expect(buildTaskBody("order_created", order, SHOP).description).toContain(
    `https://${SHOP}/admin/orders/4767924322433`
  );
});

test("never embeds customer personal data even when present", () => {
  const withPii = {
    ...order,
    email: "someone@example.com",
    customer: { first_name: "Ada", last_name: "Lovelace" },
    shipping_address: { name: "Ada Lovelace", address1: "12 Main St", country: "India" },
  };

  const { description } = buildTaskBody("order_created", withPii, SHOP);

  expect(description).not.toContain("someone@example.com");
  expect(description).not.toContain("Ada");
  expect(description).not.toContain("12 Main St");
});

test("names a refund task after the order it refunds", () => {
  expect(buildTaskBody("refund", { order_id: 55 }, SHOP).name).toBe(
    "Handle refund for order #55"
  );
});

test("reports remaining stock on a restock task", () => {
  const body = buildTaskBody("low_stock", { inventory_item_id: 99, available: 3 }, SHOP);

  expect(body.name).toBe("Restock: 99");
  expect(body.description).toContain("3");
});
