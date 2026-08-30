import { NextRequest, NextResponse } from "next/server";

/**
 * Step 1 of monday's OAuth flow. Same shape as ClickUp's, different host.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const redirectUri = `${process.env.APP_BASE_URL}/api/auth/monday/callback`;

  const authorizeUrl = new URL("https://auth.monday.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId ?? "");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authorizeUrl.toString());
}
