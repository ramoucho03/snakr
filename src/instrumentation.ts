/**
 * Server bootstrap hook (runs once, Node runtime only).
 *
 * Guards against a benign-but-destructive class of errors: when a client aborts
 * an in-flight byte stream (a cancelled <img> load, a seeked/closed <video>, or
 * simply navigating away), Node's web-stream bridge can raise an UNCAUGHT
 * `ERR_INVALID_STATE: Controller is already closed`. Left unhandled it registers
 * as an uncaughtException that can tear down a *concurrent* response's stream —
 * which surfaced as a bogus 500 ("Controller is already closed" during the RSC
 * flush) on image-heavy pages like a channel.
 *
 * We swallow ONLY that specific benign code; every other fault still crashes the
 * process exactly as Node would by default, so real bugs are never masked.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const isBenignStreamAbort = (err: unknown): boolean => {
    const e = err as (NodeJS.ErrnoException & { message?: string }) | undefined;
    return (
      e?.code === "ERR_INVALID_STATE" ||
      (typeof e?.message === "string" && e.message.includes("Controller is already closed"))
    );
  };

  process.on("uncaughtException", (err) => {
    if (isBenignStreamAbort(err)) {
      console.warn("[snakr] ignored benign stream abort:", (err as Error).message);
      return;
    }
    // Not ours — preserve Node's default: log and crash so the container restarts.
    console.error("[snakr] uncaughtException:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    if (isBenignStreamAbort(reason)) {
      console.warn("[snakr] ignored benign stream abort (rejection)");
      return;
    }
    console.error("[snakr] unhandledRejection:", reason);
  });
}
