import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SignJWT } from "jose";
import { ensureShop, type ShopStore } from "./ensureShop";

const SECRET = "test-shopify-api-secret";
const CLIENT_ID = "test-client-id";
const SHOP = "quickstart-6edde43f.myshopify.com";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = CLIENT_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mintToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    exp: now + 60,
    nbf: now - 10,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(SECRET));
}

function stubExchange(accessToken: string) {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ access_token: accessToken, scope: "read_orders" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

function fakeStore() {
  const upserts: { shopDomain: string; accessToken: string; scope?: string }[] = [];
  const store: ShopStore = {
    async upsertShop(input) {
      upserts.push(input);
      return { id: "shop-uuid-1" };
    },
    async findShopIdByDomain() {
      return null;
    },
  };
  return { store, upserts };
}

test("stores the exchanged offline token against the shop in the session token", async () => {
  stubExchange("shpat_offline_token");
  const { store, upserts } = fakeStore();

  const result = await ensureShop(await mintToken(), store);

  expect(result).toEqual({ shopId: "shop-uuid-1", shopDomain: SHOP });
  expect(upserts).toEqual([
    { shopDomain: SHOP, accessToken: "shpat_offline_token", scope: "read_orders" },
  ]);
});

test("writes nothing when the session token fails verification", async () => {
  stubExchange("shpat_should_never_be_stored");
  const { store, upserts } = fakeStore();
  const forged = await new SignJWT({
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 60,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode("wrong-secret"));

  await expect(ensureShop(forged, store)).rejects.toThrow();

  expect(upserts).toEqual([]);
});

function fakeStoreWithExisting(existingId: string | null) {
  const upserts: unknown[] = [];
  const store: ShopStore = {
    async upsertShop(input) {
      upserts.push(input);
      return { id: "shop-uuid-1" };
    },
    async findShopIdByDomain() {
      return existingId;
    },
  };
  return { store, upserts };
}

test("falls back to the installed shop when the token exchange fails", async () => {
  // The exchange is a refresh, not the install. An already-installed shop must
  // not be locked out of the app because Shopify hiccuped -- otherwise a
  // transient 500 shows "Could not complete installation" to a working store.
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })
  );
  const { store } = fakeStoreWithExisting("existing-shop-id");

  const result = await ensureShop(await mintToken(), store);

  expect(result).toEqual({ shopId: "existing-shop-id", shopDomain: SHOP });
});

test("still fails when the exchange fails and the shop was never installed", async () => {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ error: "invalid_subject_token" }), { status: 400 })
  );
  const { store } = fakeStoreWithExisting(null);

  await expect(ensureShop(await mintToken(), store)).rejects.toThrow();
});
