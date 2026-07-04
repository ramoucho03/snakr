"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

function getInitial(): Theme {
  if (typeof document === "undefined") return "dark";
  return (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(getInitial());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("snakr-theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
      className={cn(
        "glass grid h-10 w-10 place-items-center rounded-full text-text-lo transition-colors hover:text-text-hi",
        className,
      )}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
        className="grid place-items-center"
      >
        {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
      </motion.span>
    </button>
  );
}
