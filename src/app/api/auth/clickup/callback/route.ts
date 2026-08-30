import { NextRequest, NextResponse } from "next/server";
import { exchangeClickUpCode, getClickUpAuthorizedWorkspaces } from "@/lib/clickup/client";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  // TODO: pass + verify a `state` param through the flow so this callback
  // can be tied back to the right shop session (left out of this scaffold
  // for brevity — do not ship OAuth without it).
  const shopId = req.nextUrl.searchParams.get("shop_id");

  if (!code || !shopId) {
    return NextResponse.json({ error: "missing code or shop_id" }, { status: 400 });
  }

  const { access_token } = await exchangeClickUpCode(code);
  const workspaces = await getClickUpAuthorizedWorkspaces(access_token);
  const firstWorkspace = workspaces.teams?.[0];

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integrations").upsert(
    {
      shop_id: shopId,
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
