"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal global toaster: a module-level pub/sub so `toast()` can be called from
 * any client component (form handlers, action results) without threading a
 * context. Mount `<Toaster />` once in the root layout.
 */

type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let items: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string, kind: ToastKind = "success", ttl = 4200) {
  const id = ++seq;
  items = [...items, { id, kind, message }].slice(-4);
  emit();
  if (ttl > 0) setTimeout(() => dismiss(id), ttl);
  return id;
}
toast.success = (m: string) => toast(m, "success");
toast.error = (m: string) => toast(m, "error");
toast.info = (m: string) => toast(m, "info");

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const;
const TINT = {
  success: "text-success",
  error: "text-danger",
  info: "text-neon-cyan",
} as const;

export function Toaster() {
  const toasts = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="glass-strong pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 pr-2.5"
              role="status"
            >
              <Icon size={18} className={cn("mt-0.5 shrink-0", TINT[t.kind])} aria-hidden />
              <p className="flex-1 text-sm text-text-hi">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-md p-1 text-text-faint transition-colors hover:text-text-hi"
                aria-label="Fermer"
              >
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
