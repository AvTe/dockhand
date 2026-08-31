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
