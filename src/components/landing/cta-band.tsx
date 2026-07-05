"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { buttonClass } from "@/components/ui/button";

/**
 * Closing call-to-action band inside a strong glass panel. Fades + rises into
 * view once, respecting prefers-reduced-motion.
 */
export function CtaBand({ authed }: { authed: boolean }) {
  const reduce = useReducedMotion();

  const item: Variants = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 24 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 300, damping: 26 },
        },
      };

  return (
    <motion.div
      variants={item}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      className="mx-auto max-w-4xl"
    >
      <GlassCard
        strong
        sheen
        className="flex flex-col items-center gap-6 rounded-2xl px-6 py-14 text-center sm:px-12"
      >
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-text-hi">
          Reprenez le contrôle de <span className="brand-text">vos fichiers</span>.
        </h2>
        <p className="max-w-xl text-base text-text-lo sm:text-lg">
          Déployez Snak&apos;r sur votre serveur en quelques minutes. Vos données,
          votre infrastructure, vos règles.
        </p>
        <div className="mt-1 flex flex-col items-center gap-3 sm:flex-row">
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
                Créer mon espace
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
        </div>
      </GlassCard>
    </motion.div>
  );
}
