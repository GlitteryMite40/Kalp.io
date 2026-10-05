/**
 * Edge-safe session primitives.
 *
 * This module MUST NOT import Node.js-only APIs (node:crypto, postgres, fs, db)
 * because it is consumed by `src/middleware.ts`, which runs on the Edge runtime.
 * Node-only helpers (DB queries, etc.) live in `./session.ts`.
 */

export const OWNER_COOKIE_NAME = "kalp_owner_id";
export const FALLBACK_COOKIE_NAME = "owner_id";
export const OWNER_HEADER_NAME = "x-owner-id";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year (long-lived anonymous session)

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOwnerId(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

/**
 * Returns cookie options for the anonymous owner session.
 * Uses httpOnly: true, SameSite=Lax, and Secure in production.
 */
export function getOwnerCookieOptions(
  isProduction: boolean = process.env.NODE_ENV === "production",
) {
  return {
    name: OWNER_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}
