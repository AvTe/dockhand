/**
 * Minimal Shopify Admin GraphQL calls made with a shop's offline token.
 *
 * Used to put human-readable names on tasks: an inventory_levels/update payload
 * carries only inventory_item_id, so without this a restock task is titled with
 * a 14-digit number that means nothing to the merchant.
 */

const API_VERSION = "2026-10";

async function adminGraphql(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin API failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Returns null rather than throwing on any failure: a restock task with an
 * ugly title is far better than no task, so a lookup problem must never abort
 * the webhook.
 */
export async function getProductTitleForInventoryItem(
  shopDomain: string,
  accessToken: string,
  inventoryItemId: number | string
): Promise<string | null> {
  const query = `
    query ($id: ID!) {
      inventoryItem(id: $id) {
        variant { product { title } }
      }
    }
  `;

  try {
    const json = (await adminGraphql(shopDomain, accessToken, query, {
      id: `gid://shopify/InventoryItem/${inventoryItemId}`,
    })) as {
      data?: { inventoryItem?: { variant?: { product?: { title?: string } } } | null };
    };

    return json.data?.inventoryItem?.variant?.product?.title ?? null;
  } catch {
    return null;
  }
}

/**
 * Recent orders, newest first, for reconciliation.
 *
 * Returns the numeric id rather than the gid, because that is what a webhook
 * payload carries and therefore what sync_events.resource_id holds. Returns an
 * empty list rather than throwing: reconciliation is a safety net and must
 * never be the thing that breaks a page load.
 */
export async function getRecentOrders(
  shopDomain: string,
  accessToken: string,
  limit = 25
): Promise<Record<string, unknown>[]> {
  const query = `
    query ($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          displayFinancialStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 10) { nodes { title quantity sku } }
        }
      }
    }
  `;

  try {
    const json = (await adminGraphql(shopDomain, accessToken, query, { first: limit })) as {
      data?: { orders?: { nodes?: Record<string, unknown>[] } };
    };

    return (json.data?.orders?.nodes ?? []).map((node) => {
      const gid = String(node.id ?? "");
      const numericId = gid.split("/").pop() ?? gid;
      const money = (
        node.currentTotalPriceSet as { shopMoney?: { amount?: string; currencyCode?: string } }
      )?.shopMoney;
      const lineItems = (node.lineItems as { nodes?: unknown[] })?.nodes ?? [];

      // Reshaped to look like a webhook payload so the same task builder and
      // routing logic handle both paths without special cases.
      return {
        id: numericId,
        order_number: String(node.name ?? "").replace(/^#/, ""),
        financial_status: String(node.displayFinancialStatus ?? "").toLowerCase(),
        total_price: money?.amount,
        currency: money?.currencyCode,
        line_items: lineItems,
      };
    });
  } catch {
    return [];
  }
}
