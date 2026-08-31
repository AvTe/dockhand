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

      return { name: `Pack & ship #${number}`, description: lines.filter((l) => l !== null).join("\n") };
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
      const label = payload.sku ?? payload.inventory_item_id;
      const available = payload.available;
      const lines = [`Stock is low for ${label}.`];
      if (available !== undefined && available !== null) {
        lines.push(`Remaining: ${available}`);
      }
      return { name: `Restock: ${label}`, description: lines.join("\n") };
    }

    default:
      return { name: "New task from Dockhand", description: "" };
  }
}
