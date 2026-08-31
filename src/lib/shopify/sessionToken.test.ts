import { beforeEach, expect, test } from "vitest";
import { SignJWT, UnsecuredJWT } from "jose";
import { verifySessionToken } from "./sessionToken";

const SECRET = "test-shopify-api-secret";
const CLIENT_ID = "test-client-id";
const SHOP = "quickstart-6edde43f.myshopify.com";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = CLIENT_ID;
});

async function mintToken(
  overrides: Record<string, unknown> = {},
  secret: string = SECRET
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    sub: "42",
    exp: now + 60,
    nbf: now - 10,
    iat: now - 10,
    jti: "nonce-1",
    sid: "session-1",
    ...overrides,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));
}

test("returns the shop domain for a valid session token", async () => {
  const token = await mintToken();

  const result = await verifySessionToken(token);

  expect(result.shopDomain).toBe(SHOP);
});

test("rejects a token minted for a different app", async () => {
  const token = await mintToken({ aud: "some-other-apps-client-id" });

  await expect(verifySessionToken(token)).rejects.toThrow();
});

test("rejects a token whose issuer and destination name different shops", async () => {
  const token = await mintToken({ iss: "https://attacker-shop.myshopify.com/admin" });

  await expect(verifySessionToken(token)).rejects.toThrow();
});

// The three below are regression guards, not TDD-driven: jose already enforces
// them, so they passed the first time they ran. They exist to fail loudly if
// the `algorithms` pin is dropped or the verification library is swapped out.

test("rejects a token signed with the wrong secret", async () => {
  const token = await mintToken({}, "not-the-real-secret");

  await expect(verifySessionToken(token)).rejects.toThrow();
});

test("rejects an expired token", async () => {
  const past = Math.floor(Date.now() / 1000) - 120;
  const token = await mintToken({ exp: past, nbf: past - 60, iat: past - 60 });

  await expect(verifySessionToken(token)).rejects.toThrow();
});

test("rejects an unsigned token claiming alg none", async () => {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = new UnsecuredJWT({
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    exp: now + 60,
    nbf: now - 10,
  }).encode();

  await expect(verifySessionToken(unsigned)).rejects.toThrow();
});

test("accepts a token whose nbf is barely in the future, absorbing clock skew", async () => {
  // Shopify sets nbf to its own clock. A machine running a couple of seconds
  // behind sees a token that is not valid *yet* and rejects a legitimate
  // install. Measured skew against Shopify on a real dev machine was ~2s.
  const now = Math.floor(Date.now() / 1000);
  const token = await mintToken({ nbf: now + 3, iat: now + 3, exp: now + 60 });

  const result = await verifySessionToken(token);

  expect(result.shopDomain).toBe(SHOP);
});

test("still rejects a token whose nbf is far in the future", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintToken({ nbf: now + 600, iat: now + 600, exp: now + 900 });

  await expect(verifySessionToken(token)).rejects.toThrow();
});
