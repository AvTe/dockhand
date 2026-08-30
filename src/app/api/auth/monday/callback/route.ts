import { NextRequest, NextResponse } from "next/server";
import { exchangeMondayCode } from "@/lib/monday/client";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const shopId = req.nextUrl.searchParams.get("shop_id");
  // TODO: same `state` verification note as the ClickUp callback.

  if (!code || !shopId) {
    return NextResponse.json({ error: "missing code or shop_id" }, { status: 400 });
  }

  const { access_token } = await exchangeMondayCode(code);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("integrations").upsert(
    {
      shop_id: shopId,
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
