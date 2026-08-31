import { jwtVerify } from "jose";

/**
 * Seconds of clock skew tolerated when checking nbf/exp.
 *
 * Shopify stamps nbf with its own clock, so a dev machine running even a
 * second or two behind rejects a perfectly good token as not-yet-valid.
 * Measured skew on a real machine here was ~2s. Session tokens live 60s,
 * so 5s of grace is meaningful slack without materially widening the
 * window an expired token stays usable.
 */
const CLOCK_TOLERANCE_SECONDS = 5;

export type SessionTokenClaims = {
  shopDomain: string;
};

/**
 * Verifies an App Bridge session token and returns the shop it belongs to.
 *
 * This is the app's entire auth boundary for embedded requests: everything
 * downstream trusts the shop domain this returns, so every claim that binds
 * the token to *this* app and *one* shop has to be checked here.
 *
 * jose enforces the signature, `exp` and `nbf` for us, and pinning
 * `algorithms` is what stops an alg-confusion token from being accepted.
 */
export async function verifySessionToken(token: string): Promise<SessionTokenClaims> {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is not set");
  }
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_SHOPIFY_API_KEY is not set");
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
    audience: clientId,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  });

  const dest = payload.dest;
  if (typeof dest !== "string") {
    throw new Error("Session token is missing its dest claim");
  }
  const shopDomain = new URL(dest).host;

  // The app secret is shared across every shop that installs the app, so a
  // signature alone doesn't say which shop this is for. iss and dest must
  // agree, or a token issued for one shop could be presented as another's.
  const issuer = payload.iss;
  if (typeof issuer !== "string" || new URL(issuer).host !== shopDomain) {
    throw new Error("Session token iss and dest name different shops");
  }

  return { shopDomain };
}
