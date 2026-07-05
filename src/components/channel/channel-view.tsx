import Link from "next/link";
import { Pencil, Clapperboard, CalendarDays } from "lucide-react";
import type { ChannelProfile } from "@/lib/channel";
import type { VideoItem } from "@/components/video/types";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { SubscribeButton } from "@/components/video/subscribe-button";
import { ShareButton } from "@/components/video/share-button";
import { VideoCard } from "@/components/video/video-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatCount, formatViews, formatDate } from "@/lib/utils";

/** French plural: 0 and 1 stay singular. */
function plural(n: number, one: string, many: string): string {
  return n <= 1 ? one : many;
}

/**
 * The public face of a member's channel — a YouTube-style banner, identity block
 * and a responsive grid of their videos. Pure server component: it only composes
 * the client leaves (`SubscribeButton`, `VideoCard`, `Avatar`) and needs no state.
 */
export function ChannelView({
  channel,
  videos,
  canSubscribe,
  shareUrl,
}: {
  channel: ChannelProfile;
  videos: VideoItem[];
  canSubscribe: boolean;
  shareUrl: string;
}) {
  const accent = channel.accentColor;

  return (
    <section className="flex flex-col">
      {/* ---- Banner ---------------------------------------------------------- */}
      <div className="relative h-32 overflow-hidden rounded-2xl ring-1 ring-glass-border sm:h-44 lg:h-56">
        {channel.hasBanner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/users/${channel.id}/banner`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "h-full w-full",
              !accent && "bg-linear-to-br from-tan/25 via-bg-1 to-smoke/15",
            )}
            style={
              accent
                ? {
                    backgroundImage: `radial-gradient(130% 130% at 0% 0%, color-mix(in oklab, ${accent} 55%, transparent) 0%, transparent 60%), linear-gradient(135deg, var(--bg-1), var(--bg-0) 78%)`,
                  }
                : undefined
            }
          />
        )}
        {/* Scrim to seat the overlapping avatar and keep the edge legible. */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-bg-0/45 to-transparent" />
      </div>

      {/* ---- Identity row (overlaps the banner) ------------------------------ */}
      <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:gap-5">
        <div className="-mt-12 shrink-0 sm:-mt-16">
          <div className="w-fit rounded-full ring-4 ring-bg-0">
            <Avatar
              userId={channel.id}
              name={channel.name}
              hasAvatar={channel.hasAvatar}
              size={112}
              ring
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:pb-1">
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight text-text-hi sm:text-3xl">
              {channel.name}
            </h1>
            {accent && (
              <span
                className="mt-1.5 block h-0.75 w-12 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden
              />
            )}
          </div>

          {/* Meta: @handle · N abonnés · N vidéos */}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-text-lo">
            {channel.handle && (
              <>
                <span className="font-medium text-text-hi">@{channel.handle}</span>
                <span className="text-text-faint" aria-hidden>
                  ·
                </span>
              </>
            )}
            <span>
              <strong className="tabular font-semibold text-text-hi">
                {formatCount(channel.subscriberCount)}
              </strong>{" "}
              {plural(channel.subscriberCount, "abonné", "abonnés")}
            </span>
            <span className="text-text-faint" aria-hidden>
              ·
            </span>
            <span>
              <strong className="tabular font-semibold text-text-hi">
                {formatCount(channel.publicVideoCount)}
              </strong>{" "}
              {plural(channel.publicVideoCount, "vidéo", "vidéos")}
            </span>
            {channel.totalViews > 0 && (
              <>
                <span className="text-text-faint" aria-hidden>
                  ·
                </span>
                <span className="tabular">{formatViews(channel.totalViews)}</span>
              </>
            )}
          </p>

          {channel.bio && (
            <p className="line-clamp-2 max-w-2xl whitespace-pre-line text-sm text-text-lo">
              {channel.bio}
            </p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-text-faint">
            <CalendarDays size={13} aria-hidden />
            Membre depuis {formatDate(channel.memberSince)}
          </p>
        </div>

        {/* Owner edits their channel; everyone else can subscribe. Both can share. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-end sm:pb-1">
          {channel.isOwner ? (
            <Link
              href="/settings"
              className={buttonClass({ variant: "secondary", className: "rounded-full" })}
            >
              <Pencil size={16} aria-hidden />
              Personnaliser
            </Link>
          ) : (
            <SubscribeButton
              channelId={channel.id}
              initialSubscribed={channel.subscribed}
              canSubscribe={canSubscribe}
            />
          )}
          <ShareButton
            url={shareUrl}
            title="Partager la chaîne"
            description="Toute personne disposant du lien peut voir cette chaîne et ses vidéos publiques."
          />
        </div>
      </div>

      {/* ---- Videos ---------------------------------------------------------- */}
      <div className="mt-10">
        <div className="mb-5 flex items-center gap-2.5 border-b border-glass-border pb-3">
          <h2 className="font-display text-lg font-semibold text-text-hi">Vidéos</h2>
          <span className="tabular rounded-full bg-glass px-2 py-0.5 text-xs font-medium text-text-lo">
            {formatCount(videos.length)}
          </span>
        </div>

        {channel.isOwner && videos.length > 0 && channel.publicVideoCount === 0 && (
          <div className="glass mb-5 rounded-xl p-4 text-sm text-text-lo">
            Vos vidéos sont <strong className="text-text-hi">privées</strong>. Ouvrez une vidéo,
            puis passez sa visibilité sur <strong className="text-text-hi">Publique</strong> pour
            qu&apos;elle apparaisse ici pour vos visiteurs.
          </div>
        )}

        {videos.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="Aucune vidéo publique"
            description={
              channel.isOwner
                ? "Publiez une vidéo depuis son lecteur pour qu'elle apparaisse ici."
                : "Cette chaîne n'a pas encore publié de vidéo."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} basePath={channel.isOwner ? "/videos" : "/watch"} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
