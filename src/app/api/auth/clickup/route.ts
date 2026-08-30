import { NextRequest, NextResponse } from "next/server";

/**
 * Step 1 of the ClickUp OAuth flow: redirect the merchant to ClickUp's
 * authorize screen. They pick which Workspace to connect, then ClickUp
 * redirects back to /api/auth/clickup/callback with a `code`.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const redirectUri = `${process.env.APP_BASE_URL}/api/auth/clickup/callback`;

  const authorizeUrl = new URL("https://app.clickup.com/api");
  authorizeUrl.searchParams.set("client_id", clientId ?? "");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authorizeUrl.toString());
}
