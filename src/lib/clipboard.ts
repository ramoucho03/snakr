/**
 * Copy text, with a fallback for the many contexts where the async Clipboard API
 * simply is not there: `navigator.clipboard` is undefined on every insecure
 * origin — which includes Snak'r running over plain HTTP behind a LAN reverse
 * proxy, a supported deployment. The `execCommand` path is deprecated and works
 * everywhere, which is exactly the trade we want.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or unavailable — fall through */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Keep it off-screen and unfocusable-looking, but still selectable.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Whether the sheet ran at all, and if so how it ended. */
export type ShareOutcome = "unsupported" | "shared" | "dismissed";

/**
 * The native share sheet, when the platform has one. `navigator.share()` must be
 * reached synchronously from a user gesture, so this function does no awaiting
 * before it — call it directly from the handler, never after another `await`.
 *
 * "dismissed" is not "unsupported": the user saw the sheet and closed it, and
 * popping a fallback modal at them would be the wrong answer.
 */
export function nativeShare(data: { title?: string; text?: string; url: string }): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return Promise.resolve("unsupported");
  }
  return navigator.share(data).then(
    () => "shared" as const,
    () => "dismissed" as const,
  );
}
