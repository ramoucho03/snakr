"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/**
 * Hero content with a staggered mount reveal. When the user prefers reduced
 * motion, the variants collapse to no-ops so everything renders in place.
 */
export function HeroReveals({ authed }: { authed: boolean }) {
  const reduce = useReducedMotion();

  const container: Variants = reduce
    ? {}
    : {
        hidden: {},
        show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
      };

  const item: Variants = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 300, damping: 26 },
        },
      };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex max-w-3xl flex-col items-center text-center"
    >
      <motion.span
        variants={item}
        className="glass glass-sheen mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-text-lo"
      >
        <Sparkles size={15} className="text-neon-cyan" aria-hidden />
        Auto-hébergé · Open source · Sans limites
      </motion.span>

      <motion.h1
        variants={item}
        className="font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-hi"
      >
        Vos fichiers, <span className="neon-text">sans limites</span>.
      </motion.h1>

      <motion.p
        variants={item}
        className="mt-4 font-display text-xl tracking-[-0.01em] text-text-lo sm:text-2xl"
      >
        We ride, we partage.
      </motion.p>

      <motion.p
        variants={item}
        className="mt-6 max-w-2xl text-base text-text-lo sm:text-lg"
      >
        Uploads résumables multi-Go, prévisualisation universelle et partage
        sécurisé par lien — le tout 100% auto-hébergé, sur votre propre serveur.
      </motion.p>

      <motion.div
        variants={item}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
      >
        {authed ? (
          <Link
            href="/drive"
            className={buttonClass({ variant: "primary", size: "lg" })}
          >
            Ouvrir mon drive
            <ArrowRight size={18} aria-hidden />
          </Link>
        ) : (
          <>
            <Link
              href="/register"
              className={buttonClass({ variant: "primary", size: "lg" })}
            >
              Commencer gratuitement
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/login"
              className={buttonClass({ variant: "secondary", size: "lg" })}
            >
              Se connecter
            </Link>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
