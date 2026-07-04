# Snak'r — Architecture & Design Brief

**Status:** Authoritative. Build to this.
**Stack:** Next.js 15 (App Router, `output: 'standalone'`) · TypeScript · PostgreSQL 16 · Prisma · local-disk storage (S3-swappable) · Docker Compose · dark-neon glassmorphism UI · Motion (Framer Motion).
**Non-negotiables:** offline/self-contained image (zero runtime external calls), server-side authz boundary, resumable multi-GB uploads, one-command `docker compose up`.

---

## 0. Version pins & golden rules

- **Pin Next.js ≥ 15.2.3** (CVE-2025-29927 middleware bypass). Middleware is optimistic UX only — never the security boundary.
- **The security boundary is the server-side Data Access Layer (DAL).** Every server action, route handler, and data fetch calls it. No exceptions.
- **All uploads flow through the tus protocol.** Never `request.formData()`/`request.json()` on large bodies (OOM).
- **Every asset is baked into the image.** Fonts, icons, images, 3D — served from the app's own origin. A strict self-only CSP enforces it.
- **Runtime = `nodejs`** on upload/download/preview routes (`export const runtime='nodejs'`, `export const dynamic='force-dynamic'`). Never edge.

---

## (a) NPM dependency list (grouped by concern)

### Core framework
```
next@^15.2.3  react  react-dom  typescript
```

### Database / ORM
```
prisma            # CLI (pin === client)
@prisma/client
```

### Auth & security
```
@node-rs/argon2         # password + share-password hashing (argon2id). Rust-backed, fast, alpine-safe
jose                    # sign/encrypt the session id in the cookie (Edge-compatible)
zod                     # server-side input validation (creds, share config, ACL grants)
```
> **Decision:** hand-rolled DAL sessions + `jose`, **not** Auth.js. We need instant DB-backed revocation, fine-grained ACL, and full control of the share-link model — a batteries-included framework fights all three. `@node-rs/argon2` over `node-argon2`/`bcryptjs`: no native build toolchain pain on alpine, faster than JS bcrypt, and argon2id is OWASP's pick.

### Rate limiting
```
rate-limiter-flexible   # Postgres/in-memory sliding window — single-node self-host, no Redis dependency
```
> **Decision:** no `@upstash/ratelimit`/Redis — it adds an external service and breaks the single-command promise. `rate-limiter-flexible` with the Postgres backend keeps state in the DB we already run.

### Upload / storage
```
@tus/server  @tus/file-store          # local disk now
@tus/s3-store                          # add later (no app-code change)
tus-js-client                          # (transitive via Uppy; direct if hand-building)
@uppy/core  @uppy/tus  @uppy/dashboard  @uppy/react
```

### Media processing (server, background worker)
```
sharp                     # image thumbnails/normalization (strips polyglot payloads)
fluent-ffmpeg  ffmpeg-static   # video poster frames + probe
file-type                 # magic-byte MIME sniffing of uploads
```

### S3 path (later, dormant until flip)
```
@aws-sdk/client-s3  @aws-sdk/lib-storage
```

### Client preview viewers (all lazy-loaded via `next/dynamic`)
```
yet-another-react-lightbox          # images
@vidstack/react                     # video + audio (single player)
@wavesurfer/react                   # audio waveform (optional views only)
react-pdf  pdfjs-dist               # PDF
react-markdown  remark-gfm          # markdown
shiki                               # code highlight (server-side, RSC)
docx-preview                        # .docx
xlsx                                # SheetJS — .xlsx/.csv → HTML table
```

### UI / design
```
motion                              # (formerly framer-motion) — import from 'motion/react'
tailwindcss  postcss  autoprefixer
@radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tabs  # a11y primitives for modals
lucide-react                        # THE icon system — one library, MIT, tree-shaken
```

### Self-hosted fonts (bundled, offline-safe)
```
@fontsource-variable/space-grotesk   # display (OFL — zero redistribution ambiguity)
@fontsource-variable/inter           # UI/body (OFL)
```
> **Decision:** OFL fonts via Fontsource, **not** Fontshare Clash/Satoshi. The ITF license forbids redistributing raw font files "as fonts" — a public Docker artifact is a grey area. Space Grotesk (display) + Inter (UI) give the identical characterful-display / clean-UI pairing under OFL 1.1 with no legal caveat. Self-hosted → no `fonts.googleapis.com` calls (also a GDPR win).

### Build-time asset tooling
```
tsx                                  # run seed/scripts
```
> Do **not** ship `sharp` twice; the build-time image optimizer and runtime thumbnailer are the same dep.

---

## (b) Prisma data model sketch

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]   // alpine runtime engine
}
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role          { ADMIN USER }
enum ResourceType  { FILE FOLDER }
enum PrincipalType { USER GROUP }
enum AccessLevel   { READ WRITE OWNER }

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  displayName   String?
  role          Role     @default(USER)
  storageLimit  BigInt?              // null = unlimited (default). Optional admin cap.
  storageUsed   BigInt   @default(0) // bytes; reconciled on finish/delete
  mustChangePw  Boolean  @default(false)
  createdAt     DateTime @default(now())

  sessions      Session[]
  folders       Folder[]
  files         File[]
  shares        Share[]
  memberships   GroupMember[]
  grantsGiven   Permission[] @relation("GrantedBy")
}

model Session {
  id         String   @id @default(cuid())   // opaque; only this id (encrypted) rides in the cookie
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  userAgent  String?
  ip         String?
  createdAt  DateTime @default(now())
  @@index([userId])
}

model Folder {
  id          String   @id @default(cuid())
  name        String
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  parentId    String?
  parent      Folder?  @relation("Tree", fields: [parentId], references: [id], onDelete: Cascade)
  children    Folder[] @relation("Tree")
  // materialized ancestor path for O(1) inheritance resolution: "/rootId/childId/..."
  path        String   @default("/")
  files       File[]
  createdAt   DateTime @default(now())
  @@index([ownerId]); @@index([parentId]); @@index([path])
}

// Physical bytes — content-addressed, deduped, reference-counted.
model Blob {
  hash        String   @id                 // sha256 hex = storage key + integrity check
  size        BigInt
  mimeType    String                       // sniffed (magic bytes), never client-supplied
  refCount    Int      @default(0)
  createdAt   DateTime @default(now())
  files       File[]
  derivatives Derivative[]
}

// Logical file (metadata) — decoupled from disk layout.
model File {
  id           String   @id @default(cuid())
  name         String                       // original filename (metadata only, never a disk path)
  ownerId      String
  owner        User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  folderId     String?
  folder       Folder?  @relation(fields: [folderId], references: [id], onDelete: SetNull)
  blobHash     String
  blob         Blob     @relation(fields: [blobHash], references: [hash])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  shares       Share[]
  @@index([ownerId]); @@index([folderId]); @@index([blobHash])
}

// Thumbnails / posters, keyed by source blob so they're regenerable + cache-friendly.
model Derivative {
  id        String   @id @default(cuid())
  blobHash  String
  blob      Blob     @relation(fields: [blobHash], references: [hash], onDelete: Cascade)
  kind      String                          // "thumb" | "poster" | "preview"
  key       String                          // storage key of derived asset
  width     Int?
  height    Int?
  @@unique([blobHash, kind])
}

// PUBLIC share links — store only the HASH of the token.
model Share {
  id            String    @id @default(cuid())
  fileId        String?
  file          File?     @relation(fields: [fileId], references: [id], onDelete: Cascade)
  folderId      String?                        // share a folder too
  tokenHash     String    @unique              // sha256(token); token itself shown once
  passwordHash  String?                        // argon2id, optional
  expiresAt     DateTime?
  maxDownloads  Int?
  downloadCount Int       @default(0)
  revokedAt     DateTime?
  createdById   String
  createdBy     User      @relation(fields: [createdById], references: [id], onDelete: Cascade)
  createdAt     DateTime  @default(now())
  @@index([createdById])
}

// INTERNAL sharing — ACL. One row per (resource, principal).
model Permission {
  id            String        @id @default(cuid())
  resourceType  ResourceType
  resourceId    String
  principalType PrincipalType
  principalId   String
  level         AccessLevel
  grantedById   String
  grantedBy     User          @relation("GrantedBy", fields: [grantedById], references: [id])
  createdAt     DateTime      @default(now())
  @@unique([resourceType, resourceId, principalType, principalId])
  @@index([principalType, principalId])
  @@index([resourceType, resourceId])
}

model Group       { id String @id @default(cuid()); name String; members GroupMember[] }
model GroupMember {
  groupId String; userId String
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user    User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([groupId, userId])
}
```

**Effective-access resolution (DAL, server-only):** direct `Permission` on the item **OR** any grant on an ancestor folder (walk `Folder.path` segments, or a recursive CTE via `$queryRaw`), plus the user's group grants. Take the **most-permissive** matching level. Owner and ADMIN short-circuit. Never trust a client-sent capability.

---

## (c) Security decisions

| Concern | Decision |
|---|---|
| **Password hashing** | `@node-rs/argon2`, argon2id, `memoryCost=19456` (19 MiB) / `timeCost=2` / `parallelism=1` (OWASP floor; bump memory to ~46 MiB on capable hosts). Salt+params embedded in the hash; verify with `argon2.verify`. |
| **Sessions** | DB-backed. Cookie holds only the `jose`-encrypted `Session.id`: `{ httpOnly:true, secure:true, sameSite:'lax', path:'/', expires }`. Instant revoke on logout/ban by deleting the row. Never localStorage. 32-byte secret from env. |
| **Authz enforcement** | Server-only DAL: `verifySession()` wrapped in React `cache()`, plus `assertCanRead/Write(userId, resourceId)`. Called in **every** action/route/fetch. 401 unauth, 403 forbidden. Never gate in a layout (partial render skips re-check) or middleware alone. |
| **Roles** | `role` on user, loaded into session. Admin routes guard `if (session.role !== 'ADMIN') return 403`. Coarse role + fine ACL: a non-admin still needs a grant to touch another user's file. |
| **Public share tokens** | `crypto.randomBytes(32).toString('base64url')` (256-bit). Store **only** `sha256(token)`. On access: hash presented token → lookup → reject if revoked/expired/over-limit → verify optional argon2 password → **atomic** `UPDATE … SET downloadCount=downloadCount+1 WHERE … AND (maxDownloads IS NULL OR downloadCount < maxDownloads) RETURNING id` (0 rows ⇒ reject; kills the race). |
| **Upload validation** | Sniff magic bytes (`file-type`), match a strict allowlist. Reject double extensions (`.jpg.php`), null bytes, leading dots. **SVG treated as dangerous** unless sanitized. Executables/scripts blocked. Re-encode images through `sharp` to drop polyglots. |
| **Path traversal** | Store by opaque sha256 key; logical tree lives only in the DB. Any disk path built with user input: `path.resolve(STORAGE_ROOT, rel)` then assert `abs.startsWith(STORAGE_ROOT + sep)`. |
| **Download serving** | Through a route controller with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`. Never inside `public/` or any script-executing dir. |
| **Rate limiting** | Sliding window on login, password-reset, share-unlock. Key by **IP + account/token**. ~5–10/min, exponential backoff/lockout, generic errors. Done in the route/action (has identity), not middleware. |
| **CSRF** | Server Actions get Next's automatic Origin/Host check + `SameSite=Lax`. Set `serverActions.allowedOrigins` behind the proxy. Any custom cookie-authed mutating Route Handler adds an explicit double-submit CSRF token. |
| **Transport/headers** | TLS terminated at Caddy + HSTS. Strict CSP (`default-src 'self'`; no external hosts), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`. |
| **DTOs** | Never return raw user rows (password hash) to the client. Explicit column selection. |
| **Admin seed** | Idempotent `upsert` on `ADMIN_EMAIL`, `update:{}` (never clobber a rotated password), argon2id-hashed in-process, plaintext never logged, `mustChangePw=true`. |

---

## (d) Upload / storage strategy

**Transport: tus everywhere.** Client = Uppy (`@uppy/core + @uppy/tus + @uppy/dashboard`) for the pause/resume/progress/retry UI. Server = `@tus/server` v2 mounted in an App Router catch-all, driven by `server.handleWeb(request)` which streams the Web `ReadableStream` straight to the datastore — no whole-file buffering. Each PATCH carries only one `chunkSize` (8 MB) chunk, so App Router / proxy body-size limits are irrelevant.

- **Route:** `app/api/upload/[[...slug]]/route.ts`, exporting `POST PATCH HEAD GET DELETE OPTIONS`, `runtime='nodejs'`, `dynamic='force-dynamic'`.
- **Datastore:** `new FileStore({ directory: STORAGE_ROOT })` now; swap to `S3Store` later with **zero app-code change**. MinIO works via the same S3 provider (endpoint + `forcePathStyle`).
- **Quota:** enforced in `onUploadCreate` — read declared `Upload-Length`, compare `storageUsed + declared` vs `storageLimit` (null = unlimited), throw `{status_code:413}` **before bytes flow**. Reconcile actual size in `onUploadFinish`; decrement on delete.
- **Content addressing:** stream `crypto.createHash('sha256')` alongside the write. Final blob path = `blobs/ab/cd/<hash>`. If the hash exists → **dedup** (bump `Blob.refCount`, add a `File` row, don't re-store). Physical delete only when `refCount` hits 0.
- **Derivatives:** generated **async after** finish (enqueue a job — never inline). `sharp` for image thumbs (WebP q75), `fluent-ffmpeg` + `ffmpeg-static` for a video poster (`-ss` **before** `-i`; output folder **must** pre-exist or ffmpeg silently no-ops) → piped through `sharp`. Stored under `derived/<hash>/`.
- **Download/stream:** dedicated Range-aware route (Next has **no** built-in Range). No `Range` → 200 + `Accept-Ranges: bytes`. With `Range` → 206 + `Content-Range` + sliced `Content-Length`, body via `fs.createReadStream(path,{start,end})`. Mandatory for video seeking and Safari.

### The StorageProvider interface (code the whole app against this)

```ts
export interface StorageProvider {
  put(key: string, body: Readable, meta?: Record<string,string>):
      Promise<{ size: number; hash: string; key: string }>;
  get(key: string): Promise<Readable>;
  stream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  stat(key: string): Promise<{ size: number } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
```
- `LocalDiskProvider(root)` — `fs.createReadStream/createWriteStream`, streaming sha256, atomic `rename` from `.part`. Ships first.
- `S3Provider` — `@aws-sdk/lib-storage` `Upload` (multipart) for `put`, `GetObjectCommand` with `Range` for `stream`. Dormant until the storage flip.

> **Caveat for the S3 flip:** presigned direct-to-storage uploads bypass quota/hash hooks. To keep server-enforced quota + content-addressing, keep proxying through `@tus/s3-store` (retains the hooks) rather than handing out presigned PUTs.

---

## (e) Media preview matrix (per type)

Every viewer is `next/dynamic(() => import(...), { ssr:false, loading: <Skeleton/> })` and reached through a single `PreviewRouter` that dispatches by MIME/extension — so opening an image never ships pdf.js, Vidstack, or Shiki.

| Type | Library (decision) | SSR | Notes |
|---|---|---|---|
| **Images** (png/jpg/webp/avif/gif) | `yet-another-react-lightbox` + Zoom/Thumbnails/Fullscreen plugins | dynamic | Core ~14 KB; plugins load on interaction. |
| **Video** (mp4/webm/mov, HLS/DASH) | `@vidstack/react` — the single player | `ssr:false` | Native `<video>` ⇒ Range seeking free **iff** the server returns 206. HLS/DASH engines lazy-load. |
| **Audio** (mp3/aac/flac/wav) | Vidstack audio layout (reuse — no extra dep) | `ssr:false` | Add `@wavesurfer/react` **only** on views where a waveform matters; feed precomputed peaks for large files. |
| **PDF** | `react-pdf` (`pdfjs-dist`) | `ssr:false` | Next 15 needs no config workaround. Set `GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` in the **same** client module; copy the **version-matched** worker to `/public`. |
| **Code / text / config** (md/txt/js/ts/py/json/css/html/…) | `shiki`, highlighted **server-side** (RSC/rehype) — zero client highlighter JS | RSC | Client fallback `react-shiki` (web bundle, only the file's language) only if highlighting user-pasted code. |
| **Markdown** | `react-markdown` + `remark-gfm`; **`rehype-sanitize` on untrusted uploads** | RSC | Never enable `rehype-raw` on user content (XSS). |
| **.docx** | `docx-preview` (client, no server, no MS Office) | `ssr:false` | Decent fidelity. No legacy `.doc`. |
| **.xlsx / .xls / .csv** | `xlsx` (SheetJS) → `sheet_to_html` table | `ssr:false` | Cap rows / preview first sheet; large workbooks are memory-heavy. |
| **.pptx / legacy binary / unknown** | Generic **DownloadCard** (icon + name + size + metadata) | — | **No reliable free client renderer exists** — do not promise inline PowerPoint. Optional `<iframe>` only for browser-native types. |

> **Hard dependency:** the download route (section d) MUST answer Range with 206 — otherwise Vidstack scrubbing and Safari playback break regardless of the player.

---

## (f) Glassmorphism design tokens

**The 6-layer glass recipe (all six, always):** surface tint · `backdrop-blur` · **`backdrop-saturate`** (the secret — makes aurora colors bleed through vividly) · hairline top-lit border · dual shadow (outer soft + inner top highlight) · faint noise/grain. **Dark glass is invisible on flat black** — always render drifting aurora orbs (violet/cyan/magenta) behind it; that's what the glass refracts.

### Color CSS variables

```css
:root {                       /* DARK-NEON (default) */
  --bg-0: #07070c;  --bg-1: #0d0d18;
  --bg-grad:
    radial-gradient(1200px 800px at 15% -10%, #1b1140 0%, transparent 60%),
    radial-gradient(1000px 700px at 110% 20%, #04202e 0%, transparent 55%),
    #07070c;
  --glass:        rgba(255,255,255,0.06);
  --glass-strong: rgba(255,255,255,0.10);
  --glass-border: rgba(255,255,255,0.12);
  --glass-hi:     rgba(255,255,255,0.14);   /* inner top highlight */
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.45);
  --neon-violet:  #8b5cf6;   /* primary  */
  --neon-cyan:    #22d3ee;   /* secondary*/
  --neon-magenta: #ff2fd6;   /* accent   */
  --accent:       var(--neon-violet);
  --glow: 0 0 24px rgba(139,92,246,.45), 0 0 60px rgba(34,211,238,.18);
  --text-hi: #f4f5ff;  --text-lo: rgba(244,245,255,.64);
}
:root[data-theme="light"] {   /* LIGHT GLASS */
  --bg-0: #eef1f8;
  --bg-grad:
    radial-gradient(1100px 760px at 12% -8%, #dcd4ff 0%, transparent 60%),
    radial-gradient(900px 680px at 108% 12%, #cdeff7 0%, transparent 55%),
    #eef1f8;
  --glass:        rgba(255,255,255,0.55);
  --glass-strong: rgba(255,255,255,0.72);
  --glass-border: rgba(255,255,255,0.65);
  --glass-hi:     rgba(255,255,255,0.90);
  --glass-shadow: 0 8px 30px rgba(31,38,90,0.12);
  --neon-violet:  #7c3aed; --neon-cyan: #0891b2; --neon-magenta: #db2777;
  --accent: var(--neon-violet);
  --glow: 0 0 20px rgba(124,58,237,.25);
  --text-hi: #0e1020;  --text-lo: rgba(14,16,32,.62);
}
```
> Theme is switched by stamping `data-theme` on `:root`; the app defaults to dark. Both must be styled — the light block is not optional.

### Blur / radii / shadow / saturation scales

```
--blur-sm: 8px    --blur-md: 16px   --blur-lg: 22px   --blur-xl: 32px
--saturate: 1.6                       /* pair with every blur */
--radius-sm: 8px  --radius-md: 12px  --radius-lg: 16px --radius-xl: 24px  --radius-pill: 999px
--shadow-card:  var(--glass-shadow)
--shadow-hi:    inset 0 1px 0 var(--glass-hi)   /* inner top highlight — apply alongside card */
--shadow-float: 0 24px 60px rgba(0,0,0,.55)
--noise-opacity: 0.045                /* grain overlay, mix-blend-mode: overlay */
```

The canonical panel:
```css
.glass{
  position:relative; isolation:isolate;               /* own stacking context — required */
  border-radius:var(--radius-lg);
  background:var(--glass);
  -webkit-backdrop-filter:blur(var(--blur-lg)) saturate(var(--saturate));
  backdrop-filter:blur(var(--blur-lg)) saturate(var(--saturate));
  border:1px solid var(--glass-border);
  box-shadow:var(--shadow-card), var(--shadow-hi);
}
```

### Fonts
```
--font-display: "Space Grotesk Variable", "Cabinet Grotesk", sans-serif;  /* heroes */
--font-ui:      "Inter Variable", system-ui, sans-serif;                    /* body/controls */
```
Two families max, big size contrast (hero `clamp(2.6rem,6vw,5rem)` at `letter-spacing:-.03em`, body 1rem). `font-variant-numeric: tabular-nums` for file sizes/counts.

### Motion timing constants
```ts
const spring       = { type:'spring', stiffness:400, damping:34, mass:.8 };  // shared-element / hover
const springSoft   = { type:'spring', stiffness:300, damping:26 };           // list item reveal
const springTilt   = { stiffness:300, damping:20 };                          // tilt useSpring
const easePremium  = [0.22, 1, 0.36, 1];                                     // route/scroll ease
const routeMs      = 0.40;   // page transition duration
const scrollMs     = 0.60;   // whileInView reveal
const stagger      = 0.06;   // staggerChildren
const delayChildren= 0.10;
```

**Signature interactions (Motion, `import from 'motion/react'`):**
- **Shared-element preview (hero):** file card and expanded viewer share `layoutId={`file-${id}`}` inside `AnimatePresence` → GPU FLIP grow. Scope repeated rows in `<LayoutGroup>` to avoid `layoutId` collisions.
- Route transitions: `AnimatePresence mode="wait"` with blur+y fade (`easePremium`, `routeMs`).
- Staggered list reveals, `whileInView` scroll reveals (`once:true`), spring tilt cards via `useMotionValue`+`useSpring`.

**Performance + a11y guards (mandatory):**
- **Never** `backdrop-filter` a large or scrolling container — it re-rasterizes every frame. Keep glass small, fixed, `transform-gpu`, `will-change:transform` **only** on actively-animating surfaces. Blur the orb layer once (static), not the glass over a moving background.
- Virtualize long file grids; lighten per-item shadow/noise at scale.
- `@media (prefers-reduced-transparency: reduce)` → opaque `--bg-1` surfaces, `backdrop-filter:none`, hide aurora/noise.
- `@media (prefers-reduced-motion: reduce)` → kill aurora drift, tilt, route/layout animation; gate decorative JS motion with `useReducedMotion()`.
- **Contrast floor:** always a solid tint under text (`bg-white/8` dark, `bg-white/60` light); verify ≥ 4.5:1 — never let contrast depend on what's behind the glass.

---

## (g) Asset sourcing plan (zero runtime egress)

| Asset class | Source & decision | How it's baked |
|---|---|---|
| **Icons** | **Lucide** (`lucide-react`, MIT) — one library, no mixing. | Compile to SVG components in the bundle; zero runtime fetch. |
| **Fonts** | **OFL** Space Grotesk + Inter via `@fontsource-variable/*`. | woff2 + CSS bundled at build; no CDN, no GDPR exposure. |
| **Backgrounds** | **Pure CSS aurora/mesh** (radial-gradient orbs, section f). Author in SyntaxSnap/auroragradient at design time, paste raw CSS. | In stylesheet — few KB, resolution-independent, on-brand. |
| **Noise/grain** | Inline SVG `feTurbulence` **data-URI** (`mix-blend-overlay`, ~4.5% opacity). | No image request, CSP-safe. |
| **Photography** (if any) | Unsplash/Pexels **downloaded at build time**, never hotlinked. | `scripts/fetch-assets.mjs` fetches → `sharp` → AVIF/WebP responsive sizes → `public/img`. Build-time download stays under the permissive *license*, not the Unsplash *API terms* (which mandate hotlink + attribution). |
| **3D / glass-neon accents** | **CC0** packs: 3dicons.co (PNG/GLB), Shapefest (PNG), opensource3dassets/ToxSam (GLB). | Copied into `public/`. Avoid Free3D/TurboSquid "free" — non-CC0 per-model licenses. |
| **Bespoke hero / empty-states / 404 / custom motifs** | AI imagegen (reserved) — only where stock/CSS can't be on-brand. | Version-controlled with the repo. |

**Enforcement:** strict CSP `default-src 'self'; img-src 'self' data:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. Audit the built network tab — no request may hit an external host. The CSP is the guardrail against a future dev silently reintroducing a CDN link.

---

## (h) Docker / Compose + entrypoint admin-seeding plan

**Shape:** multi-stage `node:22-alpine` Dockerfile (deps → builder → runner) producing a ~150–250 MB image from `.next/standalone` + `.next/static` + `public`, running as non-root `nextjs:nodejs` (1001), with Prisma CLI + `./prisma` + migrations + seed present at runtime. Compose wires app + postgres with health-gated startup. An idempotent entrypoint runs `migrate deploy` → seed → drops privileges → execs the server under tini.

**Critical alpine/Prisma rule:** **do NOT** install `libc6-compat`/glibc — Prisma ships musl engines and glibc breaks it. Install `openssl` only, and set `binaryTargets = ["native","linux-musl-openssl-3.0.x"]`.

### Dockerfile (essentials)
```dockerfile
# deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build        # next.config: output:'standalone'

# runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl tini su-exec           # NO libc6-compat
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma runtime bits — standalone trims these; migrate/seed fail without them
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]   # runs as ROOT to chown volume, then drops
CMD ["node", "server.js"]
```

### Entrypoint (idempotent: migrate → seed → drop privs → serve)
```sh
#!/bin/sh
set -e
chown -R nextjs:nodejs /data/uploads || true                 # repair named-volume ownership
su-exec nextjs ./node_modules/.bin/prisma migrate deploy      # applies only pending migrations
su-exec nextjs ./node_modules/.bin/prisma db seed || true     # seed is idempotent
exec su-exec nextjs tini -- "$@"                              # tini = PID 1, clean SIGTERM
```
> Migrations run at **startup**, never in the Dockerfile (no DB at build time). `exec … tini` so `docker compose down` doesn't hang 10 s killing mid-request.

### Admin seed (`prisma/seed.ts` — create only if none exists)
```ts
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
const prisma = new PrismaClient();
async function main() {
  if (await prisma.user.count({ where: { role: 'ADMIN' } }) > 0) return;   // never overwrite
  const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) throw new Error('ADMIN_EMAIL/ADMIN_PASSWORD required for first boot');
  await prisma.user.upsert({
    where: { email }, update: {},                                          // no-op on re-run
    create: { email, role: 'ADMIN', mustChangePw: true,
      passwordHash: await hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
}
main().finally(() => prisma.$disconnect());   // never console.log the plaintext
```

### Compose (health-gated, persistent, one command)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment: { POSTGRES_USER: ${POSTGRES_USER}, POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}, POSTGRES_DB: ${POSTGRES_DB} }
    volumes: [ pgdata:/var/lib/postgresql/data ]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]   # doubled $$
      interval: 5s; timeout: 5s; retries: 10
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      STORAGE_ROOT: /data/uploads
    depends_on: { postgres: { condition: service_healthy } }   # waits for accept-connections, not just start
    volumes: [ uploads:/data ]
    ports: ["3000:3000"]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s; timeout: 5s; retries: 3
  caddy:                                                        # automatic TLS, no body-size limit
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [app]
    ports: ["80:80","443:443"]
    volumes: [ ./Caddyfile:/etc/caddy/Caddyfile, caddy_data:/data, caddy_config:/config ]
volumes: { pgdata: {}, uploads: {}, caddy_data: {}, caddy_config: {} }
```
`Caddyfile`: `app.example.com { reverse_proxy app:3000 }` — auto-HTTPS, no default upload cap. (nginx alternative would need `client_max_body_size 100M`; tus chunking makes even that moot, but the proxy default still bites non-tus routes.)

`app/api/health/route.ts`: `export const dynamic='force-dynamic'; export async function GET(){return new Response('ok')}`.

**Secrets:** only via `env_file: .env` at runtime. Commit `.env.example` (placeholders), gitignore `.env`, never `ARG`/`ENV`-bake `DATABASE_URL`/`ADMIN_*` (layers are inspectable).

**One command:** `docker compose up -d --build` → builds, starts postgres, waits healthy, migrates + seeds admin, serves.

---

## Consolidated pitfall checklist (do-not-ship-without)

1. Middleware used for authz → **bypassed**. DAL is the boundary; pin ≥ 15.2.3.
2. Trusting client `Content-Type`/extension → sniff magic bytes + allowlist; treat SVG as hostile.
3. Concatenating user names into disk paths → store by sha256, tree in DB, `resolve`+confine.
4. Uploads in `public/` or a script-executing dir → serve via controller with `attachment` + `nosniff`.
5. Raw share/reset tokens in DB → store only the hash.
6. `request.formData()` on big files → OOM. tus streams instead.
7. Non-atomic max-download → conditional `UPDATE … WHERE downloadCount < maxDownloads`.
8. Overwriting admin password every boot → guard on `count===0`, `update:{}`.
9. `libc6-compat` on alpine → breaks Prisma. openssl + musl `binaryTargets` only.
10. `migrate deploy` in Dockerfile / `depends_on` without `service_healthy` → race. Run in entrypoint, gate on `pg_isready`.
11. No `exec`/tini as PID 1 → SIGTERM ignored, `down` hangs.
12. Named-volume EACCES → root entrypoint chowns `/data` then `su-exec` drops privs.
13. No HTTP Range on the download route → video seeking + Safari break.
14. pdf.js worker version mismatch → serve version-matched worker from `/public`.
15. Blurring large/scrolling containers, `will-change` everywhere, `layoutId` collisions → jank; skipping `prefers-reduced-motion/-transparency` → a11y fail.
16. Any external CDN (font/image/script) → breaks the offline guarantee and CSP. Bake everything.