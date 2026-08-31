import { NextRequest, NextResponse } from "next/server";
import { resolveShopId } from "@/lib/shopify/resolveShop";
import { supabaseOAuthStateStore } from "@/lib/oauth/stateStore";

/**
 * Step 1 of monday's OAuth flow. Same shape as ClickUp's, different host.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!clientId || !appBaseUrl) {
    return NextResponse.json(
      { error: "MONDAY_CLIENT_ID or APP_BASE_URL is not set" },
      { status: 500 }
    );
  }

  const sessionToken = req.nextUrl.searchParams.get("id_token");
  if (!sessionToken) {
    return NextResponse.json({ error: "missing id_token" }, { status: 400 });
  }

  let shopId: string;
  try {
    shopId = await resolveShopId(sessionToken);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }

  const nonce = await supabaseOAuthStateStore.issue(shopId, "monday");

  const authorizeUrl = new URL("https://auth.monday.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${appBaseUrl}/api/auth/monday/callback`);
  authorizeUrl.searchParams.set("state", nonce);

  return NextResponse.redirect(authorizeUrl.toString());
}
