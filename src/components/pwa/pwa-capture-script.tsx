/**
 * Blocking inline script (CSP-nonce'd, like ThemeScript) that captures
 * `beforeinstallprompt` BEFORE React hydrates. Chromium fires the event once
 * per page load after its installability checks; stashing it on `window` means
 * the install card and the user-menu entry can use it no matter when they
 * mount. `snakr:bip` re-notifies any already-mounted listener.
 */
export function PwaCaptureScript({ nonce }: { nonce?: string }) {
  const js = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__snakrBIP=e;try{window.dispatchEvent(new Event('snakr:bip'));}catch(_){}});`;
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: js }}
      suppressHydrationWarning
    />
  );
}
