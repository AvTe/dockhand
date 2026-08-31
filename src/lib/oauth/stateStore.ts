import { getSupabaseAdmin } from "@/lib/supabase";
import { generateNonce } from "./nonce";

export type Provider = "clickup" | "monday";

export const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStateStore = {
  /** Mints a nonce bound to (shop, provider) and returns it for use as `state`. */
  issue(shopId: string, provider: Provider): Promise<string>;
  /**
   * Redeems a nonce exactly once. Returns null for anything not currently
   * redeemable: unknown, expired, already consumed, or issued for a different
   * provider. Callers must treat null as "reject the callback".
   */
  consume(nonce: string, provider: Provider): Promise<{ shopId: string } | null>;
};

/** Reference implementation of the contract, used to test consumers. */
export function createInMemoryOAuthStateStore(
  opts: { now?: () => number } = {}
): OAuthStateStore {
  const now = opts.now ?? (() => Date.now());
  const rows = new Map<
    string,
    { shopId: string; provider: Provider; expiresAt: number; consumed: boolean }
  >();

  return {
    async issue(shopId, provider) {
      const nonce = generateNonce();
      rows.set(nonce, {
        shopId,
        provider,
        expiresAt: now() + STATE_TTL_MS,
        consumed: false,
      });
      return nonce;
    },
    async consume(nonce, provider) {
      const row = rows.get(nonce);
      if (!row) return null;
      if (row.consumed) return null;
      if (row.provider !== provider) return null;
      if (row.expiresAt <= now()) return null;

      row.consumed = true;
      return { shopId: row.shopId };
    },
  };
}

export const supabaseOAuthStateStore: OAuthStateStore = {
  async issue(shopId, provider) {
    const supabase = getSupabaseAdmin();
    const nonce = generateNonce();
    const { error } = await supabase.from("oauth_states").insert({
      nonce,
      shop_id: shopId,
      provider,
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });

    if (error) throw new Error(`Failed to issue OAuth state: ${error.message}`);
    return nonce;
  },

  async consume(nonce, provider) {
    const supabase = getSupabaseAdmin();

    // Single conditional UPDATE, deliberately not SELECT-then-UPDATE: the
    // filters and the write happen in one statement, so two concurrent
    // callbacks replaying one nonce cannot both observe it as unconsumed.
    const { data, error } = await supabase
      .from("oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("nonce", nonce)
      .eq("provider", provider)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("shop_id");

    if (error) throw new Error(`Failed to consume OAuth state: ${error.message}`);
    if (!data || data.length !== 1) return null;

    return { shopId: data[0]!.shop_id as string };
  },
};
