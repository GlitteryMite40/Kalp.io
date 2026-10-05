import { NextResponse, type NextRequest } from "next/server";
import {
  OWNER_COOKIE_NAME,
  FALLBACK_COOKIE_NAME,
  OWNER_HEADER_NAME,
  isValidOwnerId,
  getOwnerCookieOptions,
} from "@/server/sessionShared";

/**
 * Next.js Proxy (formerly Middleware):
 * Runs on the Node.js runtime (Next.js 16 `proxy` convention). Edge middleware is
 * not supported when deploying as a Vercel Service, so this must NOT be `middleware.ts`.
 *
 * Issues a random anonymous owner ID in an httpOnly, Secure, SameSite=Lax cookie on first visit.
 * Forwards verified owner ID in 'x-owner-id' request header for downstream handlers.
 */
export function proxy(request: NextRequest) {
  // Check if owner cookie exists and is a valid UUID
  const cookieVal =
    request.cookies.get(OWNER_COOKIE_NAME)?.value ||
    request.cookies.get(FALLBACK_COOKIE_NAME)?.value;

  const hasValidCookie = isValidOwnerId(cookieVal);
  const ownerId = hasValidCookie
    ? (cookieVal as string).trim()
    : crypto.randomUUID();

  // Forward the owner id in the request headers so API route handlers can read it immediately
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(OWNER_HEADER_NAME, ownerId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // If cookie was missing or invalid, issue the cookie on the response
  if (!hasValidCookie) {
    const isProduction =
      process.env.NODE_ENV === "production" ||
      request.headers.get("x-forwarded-proto") === "https";

    const cookieOptions = getOwnerCookieOptions(isProduction);

    response.cookies.set({
      ...cookieOptions,
      name: OWNER_COOKIE_NAME,
      value: ownerId,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
