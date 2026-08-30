/**
 * Minimal monday.com API client — OAuth exchange + creating an item.
 * monday's API is GraphQL, not REST, so every call below POSTs a query
 * string rather than hitting a per-action endpoint.
 * Docs: https://developer.monday.com/api-reference/
 *
 * Note: this is a *private* OAuth app (not listed in monday's app
 * marketplace) — see README for why. That means no monday app-review
 * process, but also no discovery inside monday's marketplace.
 */

const MONDAY_API_BASE = "https://api.monday.com/v2";

export async function exchangeMondayCode(code: string): Promise<{
  access_token: string;
}> {
  const res = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MONDAY_CLIENT_ID,
      client_secret: process.env.MONDAY_CLIENT_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`monday token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function createMondayItem(params: {
  accessToken: string;
  boardId: string;
  groupId?: string;
  itemName: string;
  columnValues?: Record<string, unknown>;
}) {
  const query = `
    mutation ($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
      create_item(
        board_id: $boardId,
        item_name: $itemName,
        group_id: $groupId,
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  const res = await fetch(MONDAY_API_BASE, {
    method: "POST",
    headers: {
      Authorization: params.accessToken,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({
      query,
      variables: {
        boardId: params.boardId,
        itemName: params.itemName,
        groupId: params.groupId,
        columnValues: params.columnValues ? JSON.stringify(params.columnValues) : undefined,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`monday create item failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
