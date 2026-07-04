import { cn } from "@/lib/utils";

/** The Snak'r glyph — the same neon S as the favicon, inline so it themes. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="snakr-logo-g" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--neon-violet)" />
          <stop offset="0.55" stopColor="var(--neon-cyan)" />
          <stop offset="1" stopColor="var(--neon-magenta)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" className="fill-bg-1" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="15.5"
        fill="none"
        stroke="url(#snakr-logo-g)"
        strokeOpacity="0.5"
      />
      <path
        d="M44 20c-3.4-3.2-8-4.6-12.2-4.6-6.4 0-11.3 3.4-11.3 8.6 0 5 4 7.2 10.6 8.6 6.4 1.4 8.4 2.4 8.4 4.8 0 2.6-2.8 4.2-6.8 4.2-4.4 0-8.2-1.8-11-4.8"
        fill="none"
        stroke="url(#snakr-logo-g)"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full lockup: glyph + wordmark. */
export function Logo({
  size = 32,
  withText = true,
  className,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {withText && (
        <span className="font-display text-xl font-semibold tracking-tight text-text-hi">
          Snak<span className="neon-text">&apos;r</span>
        </span>
      )}
    </span>
  );
}
