import { beforeEach, expect, test } from "vitest";
import { SignJWT } from "jose";
import { resolveShopId, type ShopLookup } from "./resolveShop";

const SECRET = "test-shopify-api-secret";
const CLIENT_ID = "test-client-id";
const SHOP = "quickstart-6edde43f.myshopify.com";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = CLIENT_ID;
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

const lookup = (id: string | null): ShopLookup => ({
  async findShopIdByDomain() {
    return id;
  },
});

test("resolves the shop id for a valid session token", async () => {
  await expect(resolveShopId(await mintToken(), lookup("shop-uuid-1"))).resolves.toBe(
    "shop-uuid-1"
  );
});

test("rejects a session token for a shop that is not installed", async () => {
  await expect(resolveShopId(await mintToken(), lookup(null))).rejects.toThrow();
});

test("rejects a forged session token without consulting the shop lookup", async () => {
  let consulted = false;
  const spy: ShopLookup = {
    async findShopIdByDomain() {
      consulted = true;
      return "shop-uuid-1";
    },
  };
  const forged = await new SignJWT({ dest: `https://${SHOP}`, aud: CLIENT_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("wrong-secret"));

  await expect(resolveShopId(forged, spy)).rejects.toThrow();

  expect(consulted).toBe(false);
});
