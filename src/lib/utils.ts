import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human file size in French units (o, Ko, Mo, Go, To). */
export function formatBytes(bytes: number | bigint | null | undefined, decimals = 1): string {
  const b = bytes == null ? 0 : typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (b <= 0) return "0 o";
  const k = 1024;
  const units = ["o", "Ko", "Mo", "Go", "To", "Po"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), units.length - 1);
  const val = b / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
  { amount: Number.POSITIVE_INFINITY, unit: "years" },
];

/** "il y a 3 minutes", "hier", ... */
export function formatRelative(date: Date | string | number): string {
  const d = new Date(date);
  let duration = (d.getTime() - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return d.toLocaleDateString("fr-FR");
}

export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** File extension without the dot, lowercased. */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Two-letter initials from a name or email. */
export function initials(input?: string | null): string {
  if (!input) return "?";
  const base = input.includes("@") ? input.split("@")[0] : input;
  const parts = base.replace(/[._-]+/g, " ").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

const compact = new Intl.NumberFormat("fr", { notation: "compact", maximumFractionDigits: 1 });

/** Compact count: 999 → "999", 1500 → "1,5 k", 2_400_000 → "2,4 M". */
export function formatCount(n: number): string {
  return compact.format(n);
}

/** "1 vue" / "12 k vues" — count + pluralized noun. */
export function formatViews(n: number): string {
  return `${formatCount(n)} ${n <= 1 ? "vue" : "vues"}`;
}

/** Media duration as "m:ss" or "h:mm:ss" (YouTube-style). Empty for unknown. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
