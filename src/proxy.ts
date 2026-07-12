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

/**
 * The ONE framable surface: the bare player behind `twitter:player` and the
 * oEmbed iframe. It carries no session, no action and no clickable affordance
 * an attacker could overlay, and it only ever renders a video its owner
 * published — so relaxing `frame-ancestors` here buys the social embeds we want
 * and costs no clickjacking surface. Everything else stays `'none'`.
 */
const EMBED_PREFIX = "/embed/";

function buildCsp(nonce: string, isDev: boolean, framable: boolean): string {
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
    framable ? `frame-ancestors *` : `frame-ancestors 'none'`,
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
  const { pathname } = request.nextUrl;

  const framable = pathname.startsWith(EMBED_PREFIX);
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development", framable);

  /**
   * `X-Frame-Options` lives here rather than in next.config's blanket
   * `/:path*` header block, because a header set there cannot be un-set for a
   * single route — and Safari still enforces the legacy header even when a
   * `frame-ancestors` directive says otherwise. The proxy skips `/api`, which
   * never serves framable HTML (`safeContentType` neuters every html/js MIME).
   */
  const applyFrameHeaders = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    if (!framable) res.headers.set("X-Frame-Options", "DENY");
    return res;
  };

  // Optimistic redirect: no session cookie at all → straight to login.
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return applyFrameHeaders(NextResponse.redirect(login));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  return applyFrameHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
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
