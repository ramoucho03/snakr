"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClass } from "@/components/ui/button";

const easePremium: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Sticky glass top navigation. Logo left; theme toggle + auth-aware CTA right.
 * Entrance slide-down is gated behind prefers-reduced-motion.
 */
export function TopNav({ authed }: { authed: boolean }) {
  const reduce = useReducedMotion();

  return (
    <motion.header
      initial={reduce ? false : { y: -20, opacity: 0 }}
      animate={reduce ? false : { y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: easePremium }}
      className="sticky top-0 z-50 px-4 pt-4"
    >
      <nav className="glass glass-sheen mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl px-4 py-2.5 sm:px-5">
        <Link
          href="/"
          aria-label="Snak'r — accueil"
          className="shrink-0 rounded-lg"
        >
          <Logo />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {authed ? (
            <Link
              href="/drive"
              className={buttonClass({ variant: "primary", size: "md" })}
            >
              Ouvrir mon drive
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonClass({
                  variant: "ghost",
                  size: "md",
                  className: "hidden sm:inline-flex",
                })}
              >
                Se connecter
              </Link>
              <Link
                href="/register"
                className={buttonClass({ variant: "primary", size: "md" })}
              >
                Commencer
              </Link>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
