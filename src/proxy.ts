import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly `middleware`, renamed in Next 16). Two jobs, both OPTIMISTIC:
 *
 *  1. Emit a strict, per-request Content-Security-Policy with a fresh nonce.
 *     Next.js parses the `nonce-…` out of the header and stamps it onto every
 *     script it renders; we forward it via `x-nonce` for our one inline script.
 *  2. Bounce obviously-unauthenticated visitors away from app routes before the
 *     server even renders them — purely for snappy UX.
 *
 * This is NOT the security boundary. The Data Access Layer re-checks the session
 * on every fetch/action/route (see src/lib/dal.ts). CVE-2025-29927 taught the
 * ecosystem to never trust middleware for authz; we don't. Next 16 is patched,
 * and proxy runs on the Node runtime.
 */

// Mirror of SESSION_COOKIE in src/lib/auth.ts (kept literal so proxy stays lean).
const SESSION_COOKIE = "snakr_session";

// Routes a signed-out user has no business loading. Optimistic gate only.
const PROTECTED_PREFIXES = ["/drive", "/videos", "/admin", "/settings", "/shared"];

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    // Scripts: nonce + strict-dynamic is the real XSS guard. Next auto-nonces
    // its bootstrap scripts. wasm-unsafe-eval for pdf.js; unsafe-eval dev-only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // Styles: Tailwind, Motion, Vidstack and Radix all set inline style
    // attributes at runtime, which a nonce cannot cover — 'unsafe-inline' here
    // is unavoidable and low-risk (styles are not a script-execution vector).
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `media-src 'self' blob:`,
    `font-src 'self'`,
    // tus PATCH/HEAD are same-origin; blob: for client-side previews & workers.
    `connect-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'self'`,
    `manifest-src 'self'`,
    // NO upgrade-insecure-requests: on a plain-HTTP origin (LAN reverse proxy
    // without TLS) it silently rewrites every same-origin request to https://
    // and bricks the whole app. Assets are all same-origin here, so the
    // directive protected nothing to begin with.
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const { pathname } = request.nextUrl;

  // Optimistic redirect: no session cookie at all → straight to login.
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(login);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on pages (so the nonce is injected) but skip API routes — those set
  // their own headers and stream file bytes — plus static assets & metadata.
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
