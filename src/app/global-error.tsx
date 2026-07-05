"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself (where the
 * normal error.tsx can't render because there's no layout around it). It must
 * ship its own <html>/<body>. Kept dependency-free and inline-styled so it works
 * even if the stylesheet failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#07070c",
          color: "#f4f5ff",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: ".5rem" }}>
            Erreur inattendue
          </h1>
          <p style={{ color: "rgba(244,245,255,.64)", marginBottom: "1.5rem" }}>
            L'application a rencontré un problème. Veuillez réessayer.
          </p>
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 12,
              padding: ".7rem 1.4rem",
              background: "#8b5cf6",
              color: "#fff",
              fontSize: ".95rem",
              fontWeight: 500,
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
