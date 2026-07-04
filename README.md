# Snak'r

**We ride, we partage.** A self-hosted, offline-capable file transfer & sharing platform — resumable multi-GB uploads, universal in-app preview, secure public links, and a dark-neon glassmorphism UI. One command to run.

Built on **Next.js 16** (App Router, standalone) · **PostgreSQL 16** · **Prisma** · local-disk storage (S3-swappable) · **tus** resumable uploads · **argon2id** auth · a strict self-only CSP.

---

## Run it (one command)

```bash
cp .env.example .env      # then edit the secrets (see below)
docker compose up -d --build
```

This builds the app, starts Postgres, waits for it to be healthy, runs migrations, seeds the admin account, and serves behind Caddy (automatic HTTPS).

- App: `http://localhost` (or your `APP_DOMAIN`)
- First login uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (you'll be forced to change the password on first sign-in).

### Required `.env` secrets

| Variable | Notes |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials |
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db?schema=public` (host = `postgres` in compose) |
| `SESSION_SECRET` | ≥ 32 bytes — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seeded once, on first boot only |
| `STORAGE_ROOT` | `/data/uploads` in the container |
| `APP_DOMAIN` | domain Caddy serves (`localhost` for local) |

Registration is **closed by default** — open it in the admin console once you're in.

---

## Local development

```bash
npm install                        # .npmrc sets legacy-peer-deps for React 19
docker run -d --name snakr-pg -p 5432:5432 \
  -e POSTGRES_USER=snakr -e POSTGRES_PASSWORD=snakr -e POSTGRES_DB=snakr postgres:16-alpine
npx prisma migrate deploy          # apply schema
npm run db:seed                    # seed the admin
npm run dev                        # http://localhost:3000
```

Scripts: `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `db:studio`.

---

## Architecture

- **Security boundary = the server-side DAL.** Every server action / route handler / data fetch re-checks the session and access level ([`src/lib/dal.ts`](src/lib/dal.ts), [`src/lib/access.ts`](src/lib/access.ts)). `src/proxy.ts` only does *optimistic* redirects + the CSP nonce — never authorization (post-CVE-2025-29927).
- **Sessions** are DB-backed for instant revocation; the cookie carries only a `jose`-signed session id. Passwords + share passwords use **argon2id** (OWASP params).
- **Uploads** flow entirely through **tus** ([`/api/upload`](src/app/api/upload)) — streamed, never buffered. On finish the bytes are **content-addressed** (sha256), **deduplicated** (ref-counted blobs), quota-reconciled, and thumbnailed asynchronously ([`src/lib/upload-finalize.ts`](src/lib/upload-finalize.ts)).
- **Storage** is behind a `StorageProvider` interface ([`src/lib/storage`](src/lib/storage)) — local disk today, S3/MinIO later with zero call-site changes. The logical tree lives only in Postgres; disk keys are opaque hashes (no path traversal).
- **Downloads** are Range-aware (206) so video scrubbing and Safari work, served `attachment` + `nosniff`, never from a script-executing dir ([`src/lib/http.ts`](src/lib/http.ts)).
- **Preview** dispatches by sniffed MIME to lazily-loaded viewers (image, video/audio, PDF, code, markdown, docx, CSV, download card) — opening an image never ships pdf.js ([`src/components/preview`](src/components/preview)).
- **Sharing**: public links store only the token *hash*, support optional password (argon2id), expiry, and an **atomic** max-download counter; internal sharing is a resource/principal ACL with folder-tree inheritance.
- **Offline guarantee**: fonts, icons, backgrounds, and the pdf.js worker are all bundled/self-hosted. A strict `default-src 'self'` CSP (nonce'd scripts) is the guardrail against any CDN creeping back in.

The full design spec lives in [`docs/research-brief.md`](docs/research-brief.md).
