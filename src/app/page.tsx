import { ensureShop } from "@/lib/shopify/ensureShop";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getClickUpMembers, getClickUpSpaces } from "@/lib/clickup/client";
import { RulesManager, type RuleRow } from "./RulesManager";

/**
 * Embedded app home.
 *
 * Shopify loads this inside the admin iframe with an `id_token` search param.
 * That token drives both the install (verify -> exchange -> upsert shops) and
 * everything rendered below it.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams["id_token"];
  const sessionToken = Array.isArray(raw) ? raw[0] : raw;

  if (!sessionToken) {
    return (
      <s-page heading="Dockhand">
        <s-section>
          <s-banner heading="Open Dockhand from your Shopify admin" tone="warning">
            <s-paragraph>
              This app needs a session token to identify your store.
            </s-paragraph>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  let shopId: string;
  let shopDomain: string;
  try {
    ({ shopId, shopDomain } = await ensureShop(sessionToken));
  } catch (err) {
    return (
      <s-page heading="Dockhand">
        <s-section>
          <s-banner heading="Could not complete installation" tone="critical">
            <s-paragraph>{String(err)}</s-paragraph>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: integration } = await supabase
    .from("integrations")
    .select("access_token, workspace_id, workspace_name")
    .eq("shop_id", shopId)
    .eq("provider", "clickup")
    .maybeSingle();

  if (!integration) {
    const connectUrl = `/api/auth/clickup?id_token=${encodeURIComponent(sessionToken)}`;
    return (
      <s-page heading="Dockhand">
        <s-section heading="Connect ClickUp">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Connected to <s-text type="strong">{shopDomain}</s-text>. Connect a ClickUp
              workspace and Dockhand will turn new orders, low stock and refunds into tasks.
            </s-paragraph>
            {/*
              target="_top" is required: ClickUp's authorize page refuses to be
              framed, so an in-iframe navigation renders a blank page.
            */}
            <s-button variant="primary" href={connectUrl} target="_top">
              Connect ClickUp
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const { data: rules } = await supabase
    .from("rules")
    .select("id, trigger_event, target_list_id, condition, assignee, enabled")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  let spaces: { id: string; name: string }[] = [];
  let members: { id: string; name: string }[] = [];
  let spacesError: string | null = null;
  try {
    if (integration.workspace_id) {
      const res = await getClickUpSpaces(
        integration.access_token as string,
        integration.workspace_id as string
      );
      spaces = res.spaces.map((s) => ({ id: s.id, name: s.name }));
      members = await getClickUpMembers(
        integration.access_token as string,
        integration.workspace_id as string
      );
    }
  } catch (err) {
    spacesError = String(err);
  }

  return (
    <s-page heading="Dockhand">
      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text tone="subdued">{shopDomain}</s-text>
          <s-badge tone="success">
            ClickUp: {(integration.workspace_name as string) ?? "connected"}
          </s-badge>
        </s-stack>
      </s-section>

      {spacesError ? (
        <s-section>
          <s-banner heading="Could not load ClickUp spaces" tone="critical">
            <s-paragraph>{spacesError}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <RulesManager rules={(rules ?? []) as RuleRow[]} spaces={spaces} members={members} />
    </s-page>
  );
}
