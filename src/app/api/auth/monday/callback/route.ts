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

  // Wrapped because this is the first thing in the route that touches the
  // database: a missing SUPABASE_SERVICE_ROLE_KEY throws here, and unguarded
  // that surfaces as a bare 500 with no body -- indistinguishable from a
  // provider failure.
  let consumed: { shopId: string } | null;
  try {
    consumed = await supabaseOAuthStateStore.consume(state, "monday");
  } catch (err) {
    console.error("OAuth state lookup failed", err);
    return NextResponse.json(
      { error: "Could not verify the OAuth state", detail: String(err) },
      { status: 500 }
    );
  }
  if (!consumed) {
    return NextResponse.json({ error: "invalid or expired state" }, { status: 403 });
  }

  let access_token: string;
  try {
    ({ access_token } = await exchangeMondayCode(code));
  } catch (err) {
    console.error("monday OAuth callback failed", err);
    return NextResponse.json(
      {
        error: "Could not complete the monday connection",
        detail: String(err),
        hint: "The state nonce is single-use and has now been spent. Start the connection again from the app.",
      },
      { status: 502 }
    );
  }

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
