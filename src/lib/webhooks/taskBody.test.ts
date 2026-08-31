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

test("names an order task after what was bought", () => {
  expect(buildTaskBody("order_created", order, SHOP).name).toBe(
    "Blue T-Shirt +1 more - Placed"
  );
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

  expect(body.name).toBe("Restock: 99 (3 left)");
  expect(body.description).toContain("3");
});

// --- title format: Product - Status - Customer -------------------------------

test("titles an order with its product and status", () => {
  const body = buildTaskBody(
    "order_created",
    { order_number: 1004, financial_status: "paid", line_items: [{ title: "Red T-shirt printed", quantity: 1 }] },
    SHOP
  );

  expect(body.name).toBe("Red T-shirt printed - Placed");
});

test("adds the customer name to the title when Shopify sends one", () => {
  // Only arrives if the app is granted the customer-name protected field.
  const body = buildTaskBody(
    "order_created",
    {
      order_number: 1004,
      line_items: [{ title: "Red T-shirt printed", quantity: 1 }],
      customer: { first_name: "Amit", last_name: "Vishwakarma" },
    },
    SHOP
  );

  expect(body.name).toBe("Red T-shirt printed - Placed - Amit Vishwakarma");
});

test("omits the customer segment when Shopify redacts the name", () => {
  const body = buildTaskBody(
    "order_created",
    {
      order_number: 1004,
      line_items: [{ title: "Red T-shirt printed", quantity: 1 }],
      customer: { first_name: null, last_name: null },
    },
    SHOP
  );

  expect(body.name).toBe("Red T-shirt printed - Placed");
});

test("summarises a multi-product order in the title", () => {
  const body = buildTaskBody(
    "order_created",
    {
      order_number: 1005,
      line_items: [
        { title: "Red T-shirt printed", quantity: 1 },
        { title: "Cap", quantity: 1 },
      ],
    },
    SHOP
  );

  expect(body.name).toBe("Red T-shirt printed +1 more - Placed");
});

test("falls back to the order number when no line items are present", () => {
  expect(buildTaskBody("order_created", { order_number: 1006 }, SHOP).name).toBe(
    "Order #1006 - Placed"
  );
});

test("titles a restock with the product name when one is known", () => {
  const body = buildTaskBody(
    "low_stock",
    { inventory_item_id: 99, available: 2, product_title: "Red T-shirt printed" },
    SHOP
  );

  expect(body.name).toBe("Restock: Red T-shirt printed (2 left)");
});
