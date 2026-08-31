import { beforeEach, expect, test } from "vitest";
import { createInMemoryOAuthStateStore, type OAuthStateStore } from "./stateStore";

const SHOP_ID = "95e67666-010d-4ad5-95fe-908ce76a1752";

let clock = 1_000_000;
let store: OAuthStateStore;

beforeEach(() => {
  clock = 1_000_000;
  store = createInMemoryOAuthStateStore({ now: () => clock });
});

test("consumes a freshly issued nonce back to its shop", async () => {
  const nonce = await store.issue(SHOP_ID, "clickup");

  await expect(store.consume(nonce, "clickup")).resolves.toEqual({ shopId: SHOP_ID });
});

test("refuses to consume the same nonce twice", async () => {
  const nonce = await store.issue(SHOP_ID, "clickup");
  await store.consume(nonce, "clickup");

  await expect(store.consume(nonce, "clickup")).resolves.toBeNull();
});

test("refuses a nonce issued for a different provider", async () => {
  const nonce = await store.issue(SHOP_ID, "clickup");

  await expect(store.consume(nonce, "monday")).resolves.toBeNull();
});

test("refuses a nonce it never issued", async () => {
  await expect(store.consume("not-a-real-nonce", "clickup")).resolves.toBeNull();
});

test("refuses a nonce that has expired", async () => {
  const nonce = await store.issue(SHOP_ID, "clickup");
  clock += 11 * 60 * 1000;

  await expect(store.consume(nonce, "clickup")).resolves.toBeNull();
});
