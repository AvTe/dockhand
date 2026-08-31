import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { exchangeForOfflineToken } from "./tokenExchange";

const SHOP = "quickstart-6edde43f.myshopify.com";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = "test-client-id";
  process.env.SHOPIFY_API_SECRET = "test-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: { body?: unknown }) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

test("exchanges a session token for an offline access token", async () => {
  const calls = stubFetch(200, { access_token: "shpat_offline_token", scope: "read_orders" });

  const result = await exchangeForOfflineToken(SHOP, "the-session-token");

  expect(result.accessToken).toBe("shpat_offline_token");
  expect(calls[0]?.url).toBe(`https://${SHOP}/admin/oauth/access_token`);
  expect(calls[0]?.body).toMatchObject({
    client_id: "test-client-id",
    client_secret: "test-secret",
    subject_token: "the-session-token",
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  });
});

test("throws when Shopify rejects the exchange", async () => {
  stubFetch(400, { error: "invalid_subject_token" });

  await expect(exchangeForOfflineToken(SHOP, "expired-session-token")).rejects.toThrow();
});

test("throws when the response carries no access token", async () => {
  stubFetch(200, { scope: "read_orders" });

  await expect(exchangeForOfflineToken(SHOP, "the-session-token")).rejects.toThrow();
});

test("names the HTTP status in the error so a failure is diagnosable", async () => {
  stubFetch(401, { error: "invalid_subject_token" });

  await expect(exchangeForOfflineToken(SHOP, "bad-token")).rejects.toThrow(/401/);
});

test("rejects an online token, which would expire out from under the webhook handler", async () => {
  // Online (per-user) tokens come back with expires_in and associated_user.
  // Accepting one silently would work today and break whenever the merchant's
  // session lapsed -- with tasks silently not being created.
  stubFetch(200, {
    access_token: "shpua_an_online_token",
    scope: "read_orders",
    expires_in: 86399,
    associated_user_scope: "read_orders",
    associated_user: { id: 1, email: "merchant@example.com" },
  });

  await expect(exchangeForOfflineToken(SHOP, "the-session-token")).rejects.toThrow(/online/i);
});
