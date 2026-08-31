"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveShopId } from "@/lib/shopify/resolveShop";
import { parseRuleInput, type RuleInput } from "@/lib/rules/ruleInput";
import { mergeSpaceLists, type PickableList } from "@/lib/clickup/lists";
import {
  getClickUpFolderlessLists,
  getClickUpFolders,
  getClickUpMembers,
  getClickUpSpaces,
} from "@/lib/clickup/client";

/**
 * Server Actions are publicly callable endpoints -- Next does not authenticate
 * them. Every action here therefore starts by resolving the shop from a session
 * token, and every query is scoped to that shop id. Nothing trusts an id that
 * arrived from the client.
 */

async function clickupIntegration(shopId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("integrations")
    .select("id, access_token, workspace_id")
    .eq("shop_id", shopId)
    .eq("provider", "clickup")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createRule(sessionToken: string, input: RuleInput) {
  const shopId = await resolveShopId(sessionToken);
  const parsed = parseRuleInput(input);

  const integration = await clickupIntegration(shopId);
  if (!integration) throw new Error("Connect ClickUp before creating a rule");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("rules").insert({
    shop_id: shopId,
    integration_id: integration.id,
    trigger_event: parsed.triggerEvent,
    condition: parsed.condition,
    target_list_id: parsed.targetListId,
    assignee: parsed.assignee,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function setRuleEnabled(
  sessionToken: string,
  ruleId: string,
  enabled: boolean
) {
  const shopId = await resolveShopId(sessionToken);
  const supabase = getSupabaseAdmin();

  // Scoped to shop_id as well as id: without it, a caller with any valid
  // session token could toggle another merchant's rule by guessing a uuid.
  const { error } = await supabase
    .from("rules")
    .update({ enabled })
    .eq("id", ruleId)
    .eq("shop_id", shopId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteRule(sessionToken: string, ruleId: string) {
  const shopId = await resolveShopId(sessionToken);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("rules")
    .delete()
    .eq("id", ruleId)
    .eq("shop_id", shopId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function listSpaces(sessionToken: string) {
  const shopId = await resolveShopId(sessionToken);
  const integration = await clickupIntegration(shopId);
  if (!integration?.workspace_id) return [];

  const { spaces } = await getClickUpSpaces(
    integration.access_token as string,
    integration.workspace_id as string
  );
  return spaces.map((s) => ({ id: s.id, name: s.name }));
}

export async function listListsInSpace(
  sessionToken: string,
  spaceId: string
): Promise<PickableList[]> {
  const shopId = await resolveShopId(sessionToken);
  const integration = await clickupIntegration(shopId);
  if (!integration) return [];

  const token = integration.access_token as string;
  const [{ folders }, { lists }] = await Promise.all([
    getClickUpFolders(token, spaceId),
    getClickUpFolderlessLists(token, spaceId),
  ]);

  return mergeSpaceLists(folders, lists);
}

export async function listMembers(sessionToken: string) {
  const shopId = await resolveShopId(sessionToken);
  const integration = await clickupIntegration(shopId);
  if (!integration?.workspace_id) return [];

  return getClickUpMembers(
    integration.access_token as string,
    integration.workspace_id as string
  );
}
