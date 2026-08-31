import crypto from "node:crypto";

/**
 * Generates the random value sent as the OAuth `state` parameter.
 *
 * Must be unguessable: the whole CSRF defence rests on an attacker being
 * unable to predict a value the callback will accept. 32 random bytes,
 * base64url-encoded so it survives a query string untouched.
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString("base64url");
}
