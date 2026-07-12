import type { NextRequest } from "next/server";
import { getPublicVideoDetail } from "@/lib/videos";
import { getChannelBadge } from "@/lib/channel";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * oEmbed provider (https://oembed.com). Discord, Slack, Notion, WordPress and
 * iframely ask for this before falling back to Open Graph — it is what turns a
 * pasted link into a real embedded player with an author byline.
 *
 * Only ever describes a video its owner published: the gate is
 * `getPublicVideoDetail`, which returns null for anything PRIVATE. Consumers are
 * anonymous by nature, so there is no session to check.
 */

const DEFAULT_WIDTH = 640;
const MAX_WIDTH = 1920;

/** Accept the canonical /watch URL, and the /embed one Discord sometimes echoes. */
function videoIdFrom(url: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Refuse to describe someone else's host.
  if (parsed.origin !== origin) return null;
  const m = /^\/(?:watch|embed)\/([A-Za-z0-9_-]+)\/?$/.exec(parsed.pathname);
  return m?.[1] ?? null;
}

function clampWidth(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
  return Math.min(n, MAX_WIDTH);
}

export async function GET(req: NextRequest): Promise<Response> {
  const origin = await appOrigin();
  const params = req.nextUrl.searchParams;

  if (params.get("format") && params.get("format") !== "json") {
    // The spec says 501 for a format we do not implement (we never speak XML).
    return new Response(null, { status: 501 });
  }

  const target = params.get("url");
  const id = target ? videoIdFrom(target, origin) : null;
  if (!id) return new Response(null, { status: 404 });

  const video = await getPublicVideoDetail(id);
  if (!video) return new Response(null, { status: 404 });

  const channel = await getChannelBadge(video.ownerId, null);

  const width = clampWidth(params.get("maxwidth"));
  const height = Math.round((width * 9) / 16);
  const embed = `${origin}/embed/${id}`;
  const thumb = video.hasPoster
    ? `${origin}/api/files/${id}/poster`
    : video.hasThumb
      ? `${origin}/api/files/${id}/thumb`
      : null;

  return Response.json(
    {
      version: "1.0",
      type: "video",
      provider_name: "Snak'r",
      provider_url: origin,
      title: video.name,
      author_name: channel?.name ?? undefined,
      author_url: channel ? `${origin}/channel/${channel.handle ?? channel.id}` : undefined,
      width,
      height,
      duration: video.durationSec ? Math.round(video.durationSec) : undefined,
      ...(thumb ? { thumbnail_url: thumb, thumbnail_width: video.hasPoster ? 1280 : 640, thumbnail_height: video.hasPoster ? 720 : 360 } : {}),
      html:
        `<iframe src="${embed}" width="${width}" height="${height}" frameborder="0" ` +
        `allow="autoplay; fullscreen; picture-in-picture" allowfullscreen ` +
        `title="${escapeAttr(video.name)}"></iframe>`,
    },
    {
      headers: {
        // Unfurlers cache aggressively; a published video's metadata is stable.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}

/** The title is uploader-controlled and lands inside an HTML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
