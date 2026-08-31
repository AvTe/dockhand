import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken } from "./sessionToken";

export type ShopLookup = {
  findShopIdByDomain(shopDomain: string): Promise<string | null>;
};

export const supabaseShopLookup: ShopLookup = {
  async findShopIdByDomain(shopDomain) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shops")
      .select("id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();

    if (error) throw new Error(`Failed to look up shop: ${error.message}`);
    return data ? (data.id as string) : null;
  },
};

/**
 * Resolves a session token to an installed shop's id.
 *
 * Used by the OAuth authorize routes, which need to know which shop is
 * connecting without paying for a token exchange on every click. Verification
 * happens before the lookup, so an unverified token never reaches the database.
 */
export async function resolveShopId(
  sessionToken: string,
  lookup: ShopLookup = supabaseShopLookup
): Promise<string> {
  const { shopDomain } = await verifySessionToken(sessionToken);

  const shopId = await lookup.findShopIdByDomain(shopDomain);
  if (!shopId) {
    throw new Error(`Shop ${shopDomain} is not installed`);
  }

  return shopId;
}
