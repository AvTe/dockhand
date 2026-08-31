import { NextRequest, NextResponse } from "next/server";
import { resolveShopId } from "@/lib/shopify/resolveShop";
import { supabaseOAuthStateStore } from "@/lib/oauth/stateStore";

/**
 * Step 1 of the ClickUp OAuth flow: redirect the merchant to ClickUp's
 * authorize screen.
 *
 * Requires the embedded app's session token, because the callback has to be
 * able to prove which shop the eventual redirect belongs to. The nonce minted
 * here travels as `state` and is redeemed exactly once in the callback.
 *
 * Note for the rules UI: ClickUp's authorize page refuses to be framed, so
 * the link that hits this route must trigger a top-level navigation via App
 * Bridge, not a plain in-iframe click.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const appBaseUrl = process.env.APP_BASE_URL;
  // The secret is not used until the callback, but check it here: a missing
  // secret otherwise only surfaces as a failed token exchange after the
  // merchant has already been bounced through the provider consent screen.
  const clientSecret = process.env.CLICKUP_CLIENT_SECRET;
  const missing = [
    !clientId ? "CLICKUP_CLIENT_ID" : null,
    !clientSecret ? "CLICKUP_CLIENT_SECRET" : null,
    !appBaseUrl ? "APP_BASE_URL" : null,
  ].filter(Boolean);
  if (missing.length > 0 || !clientId || !appBaseUrl) {
    return NextResponse.json(
      { error: `Not configured on the server: ${missing.join(", ")}` },
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

  const nonce = await supabaseOAuthStateStore.issue(shopId, "clickup");

  const authorizeUrl = new URL("https://app.clickup.com/api");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${appBaseUrl}/api/auth/clickup/callback`);
  authorizeUrl.searchParams.set("state", nonce);

  return NextResponse.redirect(authorizeUrl.toString());
}
