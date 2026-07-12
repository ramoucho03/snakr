-- Media probe + richer derivatives. Fully ADDITIVE: nullable columns on existing
-- tables and one composite index. Safe to `migrate deploy` over a live DB.
--
-- Why on Blob and not File: the probe describes the BYTES. Two File rows that
-- dedup to the same sha256 share one Blob, so they share one probe.

-- AlterTable: ffprobe results, filled best-effort after upload (and lazily
-- backfilled for content uploaded before this migration).
ALTER TABLE "Blob"
  ADD COLUMN "durationSec" DOUBLE PRECISION,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "probedAt" TIMESTAMP(3);

-- AlterTable: a derivative now records its own size + MIME. "fast" (a faststart
-- remux) is not necessarily the same MIME as its source, and carrying the size
-- lets the byte routes skip a filesystem stat().
ALTER TABLE "Derivative"
  ADD COLUMN "size" INTEGER,
  ADD COLUMN "mimeType" TEXT;

-- CreateIndex: channel listings filter on (ownerId, visibility) and order by
-- publishedAt — today that is a scan of every file the owner has.
CREATE INDEX "File_ownerId_visibility_publishedAt_idx"
  ON "File"("ownerId", "visibility", "publishedAt");
