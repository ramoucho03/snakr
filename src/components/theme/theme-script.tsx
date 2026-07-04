/**
 * Blocking inline script that stamps data-theme on <html> before first paint,
 * so there is no flash of the wrong theme. Default is dark.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const js = `(function(){try{var t=localStorage.getItem('snakr-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: js }}
      suppressHydrationWarning
    />
  );
}
