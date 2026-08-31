import { expect, test } from "vitest";
import { generateNonce } from "./nonce";

test("generates a URL-safe nonce", () => {
  const nonce = generateNonce();

  expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
});

test("generates a nonce with at least 128 bits of entropy", () => {
  // base64url packs 6 bits per character, so >=22 chars means >=132 bits.
  // A guessable state defeats the entire point of the CSRF check.
  expect(generateNonce().length).toBeGreaterThanOrEqual(22);
});

test("generates a different nonce every call", () => {
  const seen = new Set(Array.from({ length: 100 }, () => generateNonce()));

  expect(seen.size).toBe(100);
});
