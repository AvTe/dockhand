import { NextRequest, NextResponse } from "next/server";
import { exchangeMondayCode } from "@/lib/monday/client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { supabaseOAuthStateStore } from "@/lib/oauth/stateStore";

/**
 * Step 2 of monday's OAuth flow. Same state handling as ClickUp's callback.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  const consumed = await supabaseOAuthStateStore.consume(state, "monday");
  if (!consumed) {
    return NextResponse.json({ error: "invalid or expired state" }, { status: 403 });
  }

  const { access_token } = await exchangeMondayCode(code);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integrations").upsert(
    {
      shop_id: consumed.shopId,
      provider: "monday",
      access_token,
    },
    { onConflict: "shop_id,provider" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(`${process.env.APP_BASE_URL}/?connected=monday`);
}
