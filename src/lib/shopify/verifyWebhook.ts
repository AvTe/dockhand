import crypto from "crypto";

/**
 * Every Shopify webhook is signed with your app's API secret in the
 * X-Shopify-Hmac-Sha256 header. Verify it before trusting the payload —
 * this is the #1 thing Shopify's app review checks for, and skipping it
 * means anyone who guesses your webhook URL can fake orders/refunds.
 *
 * `rawBody` MUST be the exact, unparsed request body bytes. Verifying
 * against a re-serialized JSON object will fail even for legitimate
 * requests, because key order / whitespace changes the byte signature.
 */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is not set");
  }

  const generatedHash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(generatedHash);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
