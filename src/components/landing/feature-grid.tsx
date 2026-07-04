"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  CloudUpload,
  Eye,
  Share2,
  FolderTree,
  ShieldCheck,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

type Feature = {
  icon: LucideIcon;
  tint: string;
  title: string;
  body: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: CloudUpload,
    tint: "text-neon-violet",
    title: "Uploads résumables",
    body: "Envoyez des fichiers de plusieurs Go via tus. Coupure réseau ou onglet fermé ? On met en pause et on reprend — jamais depuis le début.",
  },
  {
    icon: Eye,
    tint: "text-neon-cyan",
    title: "Prévisualisation universelle",
    body: "Images, vidéo, PDF, code source, documents Word… tout s'affiche directement dans le navigateur, sans rien télécharger.",
  },
  {
    icon: Share2,
    tint: "text-neon-magenta",
    title: "Partage par lien",
    body: "Protégez chaque lien par mot de passe, date d'expiration et quota de téléchargements. Vous gardez le contrôle, à chaque envoi.",
  },
  {
    icon: FolderTree,
    tint: "text-neon-violet",
    title: "Dossiers & permissions",
    body: "Organisez tout en arborescence claire et attribuez des permissions fines à chaque dossier, pour partager sans tout exposer.",
  },
  {
    icon: ShieldCheck,
    tint: "text-neon-cyan",
    title: "Sécurité sérieuse",
    body: "Sessions révocables à tout moment, mots de passe hachés en argon2id et CSP stricte. Vos données restent les vôtres.",
  },
  {
    icon: ServerCog,
    tint: "text-neon-magenta",
    title: "100% auto-hébergé",
    body: (
      <>
        Une seule commande{" "}
        <code className="rounded bg-glass px-1.5 py-0.5 font-mono text-[0.85em] text-text-hi">
          docker compose up
        </code>{" "}
        et Snak&apos;r tourne chez vous, hors ligne, sans aucune dépendance cloud.
      </>
    ),
  },
];

export function FeatureGrid() {
  const reduce = useReducedMotion();

  const container: Variants = reduce
    ? {}
    : { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

  const item: Variants = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 22 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 300, damping: 26 },
        },
      };

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        variants={item}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        className="mx-auto mb-12 max-w-2xl text-center"
      >
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-accent">
          Fonctionnalités
        </p>
        <h2 className="font-display text-[clamp(1.8rem,3.5vw,2.75rem)] font-semibold tracking-[-0.02em] text-text-hi">
          Tout pour partager <span className="neon-text">sereinement</span>
        </h2>
      </motion.div>

      <motion.ul
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <motion.li key={f.title} variants={item} className="list-none">
              <GlassCard
                sheen
                className="flex h-full flex-col gap-3 p-6 transition-colors hover:border-accent/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-glass">
                  <Icon size={22} className={f.tint} aria-hidden />
                </span>
                <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-text-hi">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-text-lo">{f.body}</p>
              </GlassCard>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
