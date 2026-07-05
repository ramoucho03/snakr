import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Aurora } from "@/components/visual/aurora";
import { ThemeScript } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/toast";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PwaCaptureScript } from "@/components/pwa/pwa-capture-script";

export const metadata: Metadata = {
  title: {
    default: "Snak'r — We ride, we partage",
    template: "%s · Snak'r",
  },
  description:
    "Snak'r — la plateforme de transfert et de partage de fichiers la plus rapide et la plus belle. Uploadez, organisez en dossiers, prévisualisez et partagez en toute sécurité.",
  applicationName: "Snak'r",
  authors: [{ name: "Snak'r" }],
  keywords: ["partage de fichiers", "cloud", "transfert", "upload", "Snak'r"],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
  // Installed-app behaviour on iOS: true standalone + branded splash per
  // device class (iOS flashes white without an exact-size startup image).
  appleWebApp: {
    capable: true,
    title: "Snak'r",
    statusBarStyle: "black",
    startupImage: [
      {
        url: "/brand/splash/apple-splash-750x1334.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-828x1792.png",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1125x2436.png",
        media:
          "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1242x2208.png",
        media:
          "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1242x2688.png",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1206x2622.png",
        media:
          "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1320x2868.png",
        media:
          "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1640x2360.png",
        media:
          "(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1668x2420.png",
        media:
          "(device-width: 834px) and (device-height: 1210px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-2064x2752.png",
        media:
          "(device-width: 1032px) and (device-height: 1376px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1179x2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1290x2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1620x2160.png",
        media:
          "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-1668x2388.png",
        media:
          "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/brand/splash/apple-splash-2048x2732.png",
        media:
          "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a07" },
    { media: "(prefers-color-scheme: light)", color: "#eae2cd" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The CSP nonce minted by proxy.ts — needed for our one inline (theme) script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
        {/* Captures beforeinstallprompt pre-hydration — see pwa-install-bus. */}
        <PwaCaptureScript nonce={nonce} />
      </head>
      <body className="min-h-dvh antialiased">
        <Aurora />
        {children}
        <Toaster />
        <PwaProvider />
        <InstallPrompt />
      </body>
    </html>
  );
}
