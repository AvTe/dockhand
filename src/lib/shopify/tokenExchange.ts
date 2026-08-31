/**
 * Trades a verified App Bridge session token for an Admin API access token.
 *
 * Deliberately requests an OFFLINE token: the webhook handler creates tasks
 * with no user present, so an online token (which is per-user and expires)
 * would stop working the moment the merchant's session ended.
 *
 * Docs: https://shopify.dev/docs/apps/auth/get-access-tokens/token-exchange
 */

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const SESSION_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const OFFLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";

export type OfflineToken = {
  accessToken: string;
  scope?: string;
};

type ExchangeResponse = {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  associated_user?: unknown;
};

export async function exchangeForOfflineToken(
  shopDomain: string,
  sessionToken: string
): Promise<OfflineToken> {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NEXT_PUBLIC_SHOPIFY_API_KEY or SHOPIFY_API_SECRET is not set");
  }

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: sessionToken,
      subject_token_type: SESSION_TOKEN_TYPE,
      requested_token_type: OFFLINE_TOKEN_TYPE,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Shopify token exchange failed: ${res.status} ${await res.text()}`
    );
  }

  const json = (await res.json()) as ExchangeResponse;

  // An online token is scoped to one logged-in user and expires. The webhook
  // handler runs with nobody logged in, so accepting one here would work in
  // testing and then quietly stop creating tasks once the session lapsed.
  // Shopify marks online tokens with expires_in / associated_user.
  if (json.expires_in !== undefined || json.associated_user !== undefined) {
    throw new Error(
      "Shopify returned an ONLINE access token (expires_in=" +
        json.expires_in +
        ") but an offline token was requested"
    );
  }

  if (!json.access_token) {
    throw new Error("Shopify token exchange returned no access_token");
  }

  return { accessToken: json.access_token, scope: json.scope };
}
