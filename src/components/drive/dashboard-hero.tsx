"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  HardDrive,
  Files,
  FolderClosed,
  Clapperboard,
  Share2,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { formatBytes, clamp, cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/dashboard";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

interface Metric {
  icon: LucideIcon;
  chip: string;
  value: number;
  label: string;
  href?: string;
}

/**
 * The drive dashboard hero: a time-aware greeting, a prominent storage meter, and
 * a row of live stat cards. Built entirely on the ink & bone tokens — glass
 * surfaces, bone/tan/smoke tints — with a staggered spring reveal.
 */
export function DashboardHero({
  name,
  greeting,
  stats,
}: {
  name: string;
  greeting: string;
  stats: DashboardStats;
}) {
  const reduce = useReducedMotion();
  const pct =
    stats.storageLimit && stats.storageLimit > 0
      ? clamp((stats.storageUsed / stats.storageLimit) * 100, 0, 100)
      : null;
  const near = pct != null && pct >= 90;

  const metrics: Metric[] = [
    { icon: Files, chip: "bg-bone/15 text-bone", value: stats.fileCount, label: "Fichiers" },
    { icon: FolderClosed, chip: "bg-smoke/20 text-smoke", value: stats.folderCount, label: "Dossiers" },
    { icon: Clapperboard, chip: "bg-tan/15 text-tan", value: stats.videoCount, label: "Vidéos", href: "/videos" },
    { icon: Share2, chip: "bg-bone/15 text-bone", value: stats.shareCount, label: "Partages", href: "/drive/shares" },
  ];

  const anim = reduce
    ? {}
    : { variants: container, initial: "hidden" as const, animate: "show" as const };

  return (
    <motion.section {...anim} className="flex flex-col gap-5">
      <motion.div variants={reduce ? undefined : item} className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-hi sm:text-[2.6rem] sm:leading-[1.05]">
          {greeting}, <span className="brand-text">{name}</span>
        </h1>
        <p className="text-sm text-text-lo">
          {stats.starredCount > 0
            ? `Vous avez ${stats.starredCount} fichier${stats.starredCount > 1 ? "s" : ""} en favori — bon retour dans votre espace.`
            : "Bienvenue dans votre espace Snak'r."}
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {/* Storage — the prominent, wider card */}
        <motion.div
          variants={reduce ? undefined : item}
          className="glass glass-sheen relative col-span-2 overflow-hidden rounded-2xl p-4 sm:p-5"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-tan/10 blur-2xl"
            aria-hidden
          />
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tan/15 text-tan">
              <HardDrive size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium uppercase tracking-wider text-text-faint">
                Stockage
              </p>
              <p className="font-display text-2xl font-semibold text-text-hi">
                <span className="tabular">{formatBytes(stats.storageUsed)}</span>
                {stats.storageLimit != null && (
                  <span className="text-base font-normal text-text-faint">
                    {" "}
                    / {formatBytes(stats.storageLimit)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {pct != null ? (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-glass-border">
                <div
                  className={cn(
                    "h-full rounded-full bg-linear-to-r transition-[width] duration-500",
                    near ? "from-danger to-danger" : "from-tan to-bone",
                  )}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <p className={cn("mt-1.5 text-xs", near ? "text-danger" : "text-text-faint")}>
                {pct.toFixed(pct < 10 ? 1 : 0)}% utilisé
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-text-faint">Stockage illimité — envoyez sans compter.</p>
          )}
        </motion.div>

        {metrics.map((m) => (
          <StatCard key={m.label} metric={m} variants={reduce ? undefined : item} />
        ))}
      </div>
    </motion.section>
  );
}

function StatCard({ metric, variants }: { metric: Metric; variants?: Variants }) {
  const { icon: Icon, chip, value, label, href } = metric;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", chip)}>
          <Icon size={18} aria-hidden />
        </span>
        {href && (
          <ArrowUpRight
            size={16}
            className="text-text-faint transition-colors group-hover:text-text-hi"
            aria-hidden
          />
        )}
      </div>
      <div>
        <p className="tabular font-display text-2xl font-semibold leading-none text-text-hi">
          {value}
        </p>
        <p className="mt-1 text-xs text-text-lo">{label}</p>
      </div>
    </>
  );

  const className =
    "glass group flex h-full flex-col justify-between gap-4 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105";

  return (
    <motion.div variants={variants}>
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </motion.div>
  );
}
