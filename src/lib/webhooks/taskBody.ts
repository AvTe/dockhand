/**
 * Builds the title and body of the task a webhook produces.
 *
 * Deliberately carries NO customer personal data. Shopify redacts name, email,
 * phone and address from these payloads because the app requests no protected
 * customer fields, and even if those fields were granted, copying them into a
 * third-party workspace forever is the wrong default. The task instead deep
 * links to the order in the Shopify admin, which is one click and always
 * current.
 */

export type TaskBody = { name: string; description: string };

type LineItem = { title?: string; quantity?: number; sku?: string | null };

/**
 * The customer name, when Shopify sends one.
 *
 * Returns null whenever the app has not been granted the customer-name
 * protected field, which is the default: Shopify delivers the customer object
 * with its name properties set to null. Titles degrade to product + status
 * rather than showing an empty segment, and start including the name the
 * moment the field is granted -- no code change needed.
 */
function customerName(payload: Record<string, unknown>): string | null {
  const customer = payload.customer as
    | { first_name?: string | null; last_name?: string | null }
    | undefined;
  const name = [customer?.first_name, customer?.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" ");
  return name || null;
}

/** What was bought, for the task title. */
function productSummary(payload: Record<string, unknown>): string | null {
  const items = Array.isArray(payload.line_items) ? (payload.line_items as LineItem[]) : [];
  const first = items[0]?.title;
  if (!first) return null;
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

function orderLines(payload: Record<string, unknown>): string[] {
  const items = Array.isArray(payload.line_items) ? (payload.line_items as LineItem[]) : [];
  return items.map((item) => {
    const qty = item.quantity ?? 1;
    const title = item.title ?? "Item";
    return item.sku ? `- ${qty} x ${title} (${item.sku})` : `- ${qty} x ${title}`;
  });
}

function adminOrderUrl(shopDomain: string, payload: Record<string, unknown>): string | null {
  const id = payload.id;
  if (typeof id !== "number" && typeof id !== "string") return null;
  return `https://${shopDomain}/admin/orders/${id}`;
}

export function buildTaskBody(
  triggerEvent: string,
  payload: Record<string, unknown>,
  shopDomain: string
): TaskBody {
  switch (triggerEvent) {
    case "order_created": {
      const number = payload.order_number ?? payload.id;
      const lines = [
        `Order #${number}`,
        payload.total_price ? `Total: ${payload.total_price} ${payload.currency ?? ""}`.trim() : null,
        payload.financial_status ? `Payment: ${payload.financial_status}` : null,
        "",
        "Items:",
        ...orderLines(payload),
      ];

      const country = (payload.shipping_address as { country?: string } | undefined)?.country;
      if (country) lines.push("", `Ships to: ${country}`);

      const url = adminOrderUrl(shopDomain, payload);
      if (url) lines.push("", `Customer details and full order: ${url}`);

      // Product - Status - Customer. The customer segment is dropped when
      // Shopify redacts the name, which it does unless the protected field is
      // granted.
      const titleParts = [productSummary(payload) ?? `Order #${number}`, "Placed"];
      const who = customerName(payload);
      if (who) titleParts.push(who);

      return {
        name: titleParts.join(" - "),
        description: lines.filter((l) => l !== null).join("\n"),
      };
    }

    case "refund": {
      const orderId = payload.order_id;
      const lines = [`Refund raised on order #${orderId}`];
      if (typeof orderId === "number" || typeof orderId === "string") {
        lines.push("", `Order in Shopify: https://${shopDomain}/admin/orders/${orderId}`);
      }
      return { name: `Handle refund for order #${orderId}`, description: lines.join("\n") };
    }

    case "low_stock": {
      // product_title is resolved from the Admin API by the caller when it
      // can be; a raw inventory_item_id is a meaningless number to a merchant.
      const label = payload.product_title ?? payload.sku ?? payload.inventory_item_id;
      const available = payload.available;
      const lines = [`Stock is low for ${label}.`];
      if (available !== undefined && available !== null) {
        lines.push(`Remaining: ${available}`);
      }
      const name =
        available !== undefined && available !== null
          ? `Restock: ${label} (${available} left)`
          : `Restock: ${label}`;
      return { name, description: lines.join("\n") };
    }

    default:
      return { name: "New task from Dockhand", description: "" };
  }
}
