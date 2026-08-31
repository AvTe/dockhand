/**
 * Minimal ClickUp API client — OAuth exchange + creating a task.
 * Docs: https://developer.clickup.com/docs
 *
 * Rate limit: 100 requests/min PER TOKEN on Free/Unlimited/Business plans
 * (each connected merchant has their own token, so this scales fine across
 * customers — just don't hammer one merchant's token in a tight loop, e.g.
 * during a historical backfill; add a small delay or a queue there).
 */

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export async function exchangeClickUpCode(code: string): Promise<{
  access_token: string;
}> {
  const res = await fetch("https://api.clickup.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getClickUpAuthorizedWorkspaces(accessToken: string) {
  const res = await fetch(`${CLICKUP_API_BASE}/team`, {
    headers: { Authorization: accessToken },
  });
  if (!res.ok) {
    throw new Error(`ClickUp get teams failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function createClickUpTask(params: {
  accessToken: string;
  listId: string;
  name: string;
  description?: string;
  dueDateMs?: number;
}) {
  const res = await fetch(`${CLICKUP_API_BASE}/list/${params.listId}/task`, {
    method: "POST",
    headers: {
      Authorization: params.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      description: params.description ?? "",
      due_date: params.dueDateMs,
    }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp create task failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getClickUpSpaces(accessToken: string, teamId: string) {
  const res = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/space?archived=false`, {
    headers: { Authorization: accessToken },
  });
  if (!res.ok) {
    throw new Error(`ClickUp get spaces failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ spaces: { id: string; name: string }[] }>;
}

export async function getClickUpFolders(accessToken: string, spaceId: string) {
  const res = await fetch(`${CLICKUP_API_BASE}/space/${spaceId}/folder?archived=false`, {
    headers: { Authorization: accessToken },
  });
  if (!res.ok) {
    throw new Error(`ClickUp get folders failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{
    folders: { id: string; name: string; lists?: { id: string; name: string }[] }[];
  }>;
}

export async function getClickUpFolderlessLists(accessToken: string, spaceId: string) {
  const res = await fetch(`${CLICKUP_API_BASE}/space/${spaceId}/list?archived=false`, {
    headers: { Authorization: accessToken },
  });
  if (!res.ok) {
    throw new Error(`ClickUp get lists failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ lists: { id: string; name: string }[] }>;
}
