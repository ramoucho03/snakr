import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Aurora } from "@/components/visual/aurora";
import { ThemeScript } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/toast";

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
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070c" },
    { media: "(prefers-color-scheme: light)", color: "#eef1f8" },
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
      </head>
      <body className="min-h-dvh antialiased">
        <Aurora />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
