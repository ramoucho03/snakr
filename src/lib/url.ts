import "server-only";
import { headers } from "next/headers";

/**
 * Absolute-URL resolution for anything a machine outside the browser will read:
 * Open Graph tags, oEmbed payloads, JSON-LD, the sitemap. Every one of those
 * rejects (or silently drops) a relative URL.
 *
 * `APP_URL` is authoritative when the operator sets it. Otherwise we reconstruct
 * the origin from the request, honouring the `X-Forwarded-*` headers that a
 * reverse proxy (Nginx Proxy Manager, Caddy) sets — without them a TLS-
 * terminating proxy makes every generated link http:// and Facebook drops it.
 *
 * Read straight from `process.env`, never through `serverEnv()`: that one
 * validates the whole schema (DATABASE_URL and friends) and would blow up
 * `next build`, which runs with no database in sight.
 */

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The public origin of this instance, e.g. `https://snakr.fusionbase.be`. */
export async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL;
  if (configured) return normalize(configured);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
  return normalize(`${proto}://${host}`);
}

/** Join a root-relative path onto the public origin. */
export async function absoluteUrl(path: string): Promise<string> {
  const origin = await appOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The two Unicode line terminators JSON permits inside a string but JavaScript
 * does not. Built from escapes rather than literals so the source stays ASCII.
 */
const LINE_TERMINATORS = new RegExp("[\\u2028\\u2029]", "g");

/**
 * Serialize a JSON-LD payload for a `<script>` body. `JSON.stringify` alone is
 * not enough: a video titled `</script><script>...` would break out of the
 * element, and titles are uploader-controlled.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_TERMINATORS, (c) => (c.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029"));
}

/** Seconds -> ISO 8601 duration ("PT1H2M3S"), the shape schema.org wants. */
export function isoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}
