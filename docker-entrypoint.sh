#!/bin/sh
# -----------------------------------------------------------------------------
# Snak'r container entrypoint — idempotent first-boot bring-up.
# Starts as root to repair the named-volume ownership, then drops to `nextjs`
# for every real action. Order: chown volume -> migrate -> seed -> exec server.
# Migrations run HERE (startup), never in the Dockerfile: there is no DB at build.
# -----------------------------------------------------------------------------
set -e

# Repair ownership of the (possibly root-owned) named volume so nextjs can write.
chown -R nextjs:nodejs /data/uploads || true

# Apply only pending migrations. Fails loudly (no `|| true`): a broken schema
# must stop startup rather than serve against a half-migrated DB.
su-exec nextjs ./node_modules/.bin/prisma migrate deploy

# Seed the initial admin + default settings. Idempotent (guards on existing
# admin), so `|| true` keeps restarts clean even once seeding is a no-op.
su-exec nextjs ./node_modules/.bin/prisma db seed || true

# Hand off to the server as non-root under tini (PID 1) for clean SIGTERM
# reaping, so `docker compose down` stops fast instead of a 10s kill wait.
exec su-exec nextjs tini -- "$@"
