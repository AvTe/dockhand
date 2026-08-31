import { NextRequest, NextResponse } from "next/server";
import { exchangeClickUpCode, getClickUpAuthorizedWorkspaces } from "@/lib/clickup/client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { supabaseOAuthStateStore } from "@/lib/oauth/stateStore";

/**
 * Step 2 of the ClickUp OAuth flow.
 *
 * The shop is derived from the single-use `state` nonce, never from the query
 * string. Reading shop_id off the URL (as this route used to) let anyone bind
 * their own ClickUp workspace to someone else's shop, which would pipe that
 * shop's order data into an attacker's board.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  const consumed = await supabaseOAuthStateStore.consume(state, "clickup");
  if (!consumed) {
    // Unknown, expired, already used, or minted for a different provider.
    return NextResponse.json({ error: "invalid or expired state" }, { status: 403 });
  }

  const { access_token } = await exchangeClickUpCode(code);
  const workspaces = await getClickUpAuthorizedWorkspaces(access_token);
  const firstWorkspace = workspaces.teams?.[0];

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integrations").upsert(
    {
      shop_id: consumed.shopId,
      provider: "clickup",
      access_token,
      workspace_id: firstWorkspace?.id,
      workspace_name: firstWorkspace?.name,
    },
    { onConflict: "shop_id,provider" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(`${process.env.APP_BASE_URL}/?connected=clickup`);
}
