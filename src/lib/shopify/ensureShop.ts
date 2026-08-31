import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken } from "./sessionToken";
import { exchangeForOfflineToken } from "./tokenExchange";

/**
 * The persistence ensureShop needs, kept as an interface so the install flow
 * can be tested without a live database. The Supabase implementation is
 * supabaseShopStore below.
 */
export type ShopStore = {
  upsertShop(input: {
    shopDomain: string;
    accessToken: string;
    scope?: string;
  }): Promise<{ id: string }>;
};

export const supabaseShopStore: ShopStore = {
  async upsertShop({ shopDomain, accessToken, scope }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shops")
      .upsert(
        { shop_domain: shopDomain, access_token: accessToken, scope },
        { onConflict: "shop_domain" }
      )
      .select("id")
      .single();

    if (error) throw new Error(`Failed to upsert shop: ${error.message}`);
    return { id: data.id as string };
  },
};

/**
 * Turns a raw App Bridge session token into a persisted shop row.
 *
 * This replaces the OAuth install redirect entirely: with managed install,
 * Shopify grants the scopes from shopify.app.toml, and the app's only job is
 * to trade a session token for an offline Admin token the first time a
 * merchant opens it. Idempotent -- reopening the app just refreshes the row.
 */
export async function ensureShop(
  sessionToken: string,
  store: ShopStore = supabaseShopStore
): Promise<{ shopId: string; shopDomain: string }> {
  const { shopDomain } = await verifySessionToken(sessionToken);
  const { accessToken, scope } = await exchangeForOfflineToken(shopDomain, sessionToken);
  const { id } = await store.upsertShop({ shopDomain, accessToken, scope });

  return { shopId: id, shopDomain };
}
