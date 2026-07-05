# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Snak'r production image — multi-stage node:22-alpine (deps -> builder -> runner)
# Produces a self-contained Next.js standalone server that also carries the
# Prisma CLI + engines and the seed toolchain, so `migrate deploy` and `db seed`
# run at container start (never at build time — there is no DB during build).
# -----------------------------------------------------------------------------

##############################
# deps — install node_modules reproducibly (respects .npmrc legacy-peer-deps)
##############################
FROM node:22-alpine AS deps
WORKDIR /app
# .npmrc carries legacy-peer-deps=true so `npm ci` resolves identically to local.
COPY package.json package-lock.json .npmrc ./
# Schema present before install so @prisma/client's postinstall can see it.
COPY prisma ./prisma
RUN npm ci

##############################
# builder — generate the Prisma client (musl engine) + build the standalone app
##############################
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
# node_modules is in .dockerignore, so this copies source only (never clobbers it).
COPY . .
# Prisma client must be generated before `next build` traces it into standalone.
RUN npx prisma generate && npm run build

##############################
# runner — minimal, non-root, Prisma- and seed-capable runtime
##############################
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# openssl -> Prisma query engine ; tini -> PID 1 signal reaping ;
# su-exec -> drop privileges after chowning the volume ; ffmpeg -> video poster
# frames (the bundled ffmpeg-static is glibc-linked and can't exec on musl, so we
# use Alpine's musl ffmpeg and point FFMPEG_PATH at it in compose).
# NO libc6-compat: it pulls glibc and breaks Prisma's musl engine on alpine.
RUN apk add --no-cache openssl tini su-exec ffmpeg

# Dedicated non-root runtime identity.
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# --- Next.js standalone output: server + traced node_modules + static assets ---
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# --- Full package.json: `prisma db seed` reads the `prisma.seed` key from it ---
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# --- Prisma runtime bits: the standalone trace omits the CLI + engines, so
#     `migrate deploy` / `db seed` need these copied in explicitly. ---
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# --- Seed toolchain: `prisma db seed` runs `tsx prisma/seed.ts`, which imports
#     @node-rs/argon2. None of these are guaranteed by the standalone trace, so
#     copy them (and tsx's esbuild dependency, whole @esbuild/@node-rs platform
#     dirs to stay arch-agnostic) to make first-boot seeding actually work. ---
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/esbuild ./node_modules/.bin/esbuild

# Upload volume mount point — created + owned before the volume is attached so
# the entrypoint's chown has a target even on a fresh named volume.
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data

# Entrypoint drops privileges itself, so it (and CMD) start as root to chown /data.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Strip any CR (belt-and-suspenders vs .gitattributes): a CRLF shebang makes the
# Alpine container die with "no such file or directory" on PID 1.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Runs as ROOT (chowns the named volume) then su-exec's down to nextjs.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
