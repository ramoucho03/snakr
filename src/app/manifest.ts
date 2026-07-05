import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes Snak'r installable on Android, iOS and desktop.
 * Served at /manifest.webmanifest and auto-linked by Next in every page head.
 * Icons: full-bleed artwork for classic launchers + padded `maskable` variants
 * so adaptive-icon platforms (Android) can crop freely without clipping art.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Snak'r — We ride, we partage",
    short_name: "Snak'r",
    description:
      "Transfert et partage de fichiers auto-hébergé : uploads résumables multi-Go, prévisualisation universelle et liens sécurisés.",
    start_url: "/drive",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0a07",
    theme_color: "#0b0a07",
    lang: "fr",
    dir: "ltr",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Mon drive",
        url: "/drive",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Favoris",
        url: "/drive/starred",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Vidéos",
        url: "/videos",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Mes partages",
        url: "/drive/shares",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
