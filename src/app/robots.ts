import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Note what is NOT disallowed: `/api/files/`. A social card's `og:image` and
 * `og:video` point straight at it, and `facebookexternalhit` honours robots.txt
 * before fetching them — blanket-blocking `/api` would silently kill every
 * unfurl. The routes under it are ACL'd anyway; only published videos answer an
 * anonymous crawler.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await appOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/drive",
        "/videos",
        "/admin",
        "/settings",
        "/shared",
        "/s/", // public share links: unguessable tokens, never to be indexed
        "/api/upload",
        "/api/profile",
        "/api/health",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
