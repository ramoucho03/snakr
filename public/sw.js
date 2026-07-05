/**
 * Snak'r service worker — installability + resilient static caching.
 *
 * Deliberately conservative for a PRIVATE, authenticated file app:
 *   - HTML/documents are NEVER cached (network-only + branded offline page):
 *     no drive listing, share page or preview ever lands on shared-device disk.
 *   - /api/* is never intercepted: auth'd bytes, tus uploads (POST/PATCH/HEAD)
 *     and Range-based video streaming must hit the network untouched.
 *   - Immutable Next assets (/_next/static) are cache-first; public brand
 *     assets are stale-while-revalidate. That's it.
 *
 * Bump VERSION to invalidate every cache on the next deploy; the app shows an
 * update banner when a new worker is waiting (see PwaProvider).
 */
const VERSION = "v1";
const STATIC_CACHE = `snakr-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/favicon.svg",
  "/brand/logo-512.webp",
  "/brand/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("snakr-") && n !== STATIC_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// The update banner posts this once the user clicks "Mettre à jour".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Immutable, content-hashed build assets → cache-first. */
function isImmutable(url) {
  return url.pathname.startsWith("/_next/static/");
}

/**
 * Public static brand files → stale-while-revalidate.
 * NOT /pdf.worker.min.mjs: pdf.js hard-throws on any API/worker version
 * mismatch, so serving a stale cached worker after a pdf.js upgrade would
 * break every PDF preview — that file must always come from the network.
 */
function isPublicAsset(url) {
  return (
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/apple-touch-icon.png"
  );
}

/**
 * Keep only the newest hashed build chunks: deploys rotate chunk names, and
 * without a cap the dead ones from every past deploy pile up until the
 * browser evicts the whole origin under storage pressure.
 */
const MAX_BUILD_ENTRIES = 150;
async function trimBuildCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const build = keys.filter((r) => new URL(r.url).pathname.startsWith("/_next/static/"));
  const excess = build.length - MAX_BUILD_ENTRIES;
  if (excess <= 0) return;
  // Cache keys come back in insertion order — drop the oldest first.
  await Promise.all(build.slice(0, excess).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Range requests (video/audio scrubbing) and API bytes: straight to network.
  if (request.headers.has("range")) return;
  if (url.pathname.startsWith("/api/")) return;

  // Documents: network-only, branded fallback when truly offline. The final
  // synthesized 503 only exists so respondWith never resolves undefined.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return (
          offline ||
          new Response("Hors ligne — reconnectez-vous puis réessayez.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches
                .open(STATIC_CACHE)
                .then((c) => c.put(request, copy))
                .then(trimBuildCache);
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (isPublicAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const refresh = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => undefined);
        return hit || refresh.then((res) => res || Response.error());
      }),
    );
  }
  // Everything else: untouched.
});
