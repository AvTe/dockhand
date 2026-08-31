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
  /** The shop's id if it is already installed, else null. */
  findShopIdByDomain(shopDomain: string): Promise<string | null>;
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

  async findShopIdByDomain(shopDomain) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();
    return data ? (data.id as string) : null;
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

  try {
    const { accessToken, scope } = await exchangeForOfflineToken(shopDomain, sessionToken);
    const { id } = await store.upsertShop({ shopDomain, accessToken, scope });
    return { shopId: id, shopDomain };
  } catch (err) {
    // For an installed shop the exchange is a token refresh, not the install
    // itself -- the stored offline token is still valid. Failing hard here
    // would show "Could not complete installation" to a working store because
    // Shopify hiccuped. Only a shop we have never seen is a real failure.
    const existingId = await store.findShopIdByDomain(shopDomain);
    if (existingId) {
      console.error("Token exchange failed; continuing with stored token", err);
      return { shopId: existingId, shopDomain };
    }
    throw err;
  }
}
