import type { NextConfig } from "next";

// Static security headers (the per-request, nonce-bearing CSP lives in proxy.ts).
// These are constant so they belong in the config, applied to every response.
//
// `X-Frame-Options` is deliberately absent: a header declared on `/:path*`
// cannot be un-declared for a single route, and `/embed/[id]` has to be framable
// for social player cards. proxy.ts sets it per-request, everywhere but there.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for a small, fast Docker image.
  output: "standalone",

  // Nothing downstream needs to know which framework serves these bytes.
  poweredByHeader: false,

  // A stray lockfile in a parent directory makes Next mis-infer the workspace
  // root, which breaks standalone file tracing. Pin both to this project.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,

  // Native / heavy packages must run in Node and never be bundled by Turbopack.
  // argon2 & sharp ship native .node binaries; the tus + ffmpeg + file-type
  // stack is server-only and pulls in Node built-ins the bundler shouldn't trace.
  serverExternalPackages: [
    "@node-rs/argon2",
    "sharp",
    "@tus/server",
    "@tus/file-store",
    "fluent-ffmpeg",
    "ffmpeg-static",
    "file-type",
  ],

  // Every user file and thumbnail is streamed through our own Range-aware route
  // handlers; next/image is only used for bundled UI art. Remote patterns stay
  // empty — nothing is ever fetched from a third-party host at runtime (offline
  // guarantee + CSP default-src 'self').
  images: {
    remotePatterns: [],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  experimental: {
    serverActions: {
      // Server Actions carry only small mutations (auth, rename, share config,
      // avatars). Multi-GB uploads stream through the tus Route Handler under
      // /api/upload, which is not a Server Action and ignores this limit.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
