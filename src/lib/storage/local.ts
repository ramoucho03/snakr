import "server-only";
import {
  createReadStream,
  createWriteStream,
  promises as fs,
} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { ByteRange, StorageProvider } from "./types";

/**
 * Local-disk StorageProvider. Content lives under an opaque, hashed key tree;
 * the logical file/folder structure is only ever in Postgres. Two safety rules:
 *  - Every key is `resolve`d and asserted to stay under the root (no `../`).
 *  - Writes land on a `.part` sibling and are `rename`d into place, so a reader
 *    never sees a half-written blob.
 *
 * Beyond the `StorageProvider` contract it exposes a few local-only helpers
 * (absPath / hashFile / moveInto) that the tus finalizer uses to content-address
 * a completed upload without buffering multi-GB files in memory.
 */
export class LocalDiskProvider implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolve a key to an absolute path, refusing anything outside the root. */
  absPath(key: string): string {
    const rel = key.replace(/^[/\\]+/, "");
    const abs = path.resolve(this.root, rel);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes storage root: ${key}`);
    }
    return abs;
  }

  private async ensureParent(abs: string): Promise<void> {
    await fs.mkdir(path.dirname(abs), { recursive: true });
  }

  async put(key: string, body: Readable): Promise<{ size: number; hash: string; key: string }> {
    const abs = this.absPath(key);
    await this.ensureParent(abs);
    const part = `${abs}.part-${crypto.randomBytes(6).toString("hex")}`;
    const hash = crypto.createHash("sha256");
    let size = 0;

    try {
      // Hash inline while streaming to disk (backpressure preserved by pipeline).
      await pipeline(
        body,
        async function* (source) {
          for await (const chunk of source) {
            hash.update(chunk as Buffer);
            size += (chunk as Buffer).length;
            yield chunk;
          }
        },
        createWriteStream(part),
      );
    } catch (err) {
      await fs.rm(part, { force: true });
      throw err;
    }

    await fs.rename(part, abs);
    return { size, hash: hash.digest("hex"), key };
  }

  async stream(key: string, range?: ByteRange): Promise<Readable> {
    const abs = this.absPath(key);
    return range
      ? createReadStream(abs, { start: range.start, end: range.end })
      : createReadStream(abs);
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const s = await fs.stat(this.absPath(key));
      return { size: s.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.absPath(key), { force: true });
  }

  // ── Local-only helpers (used by the tus upload finalizer) ────────────────

  /** Stream a file through sha256; returns the digest + byte size. No buffering. */
  async hashFile(absSource: string): Promise<{ hash: string; size: number }> {
    const hash = crypto.createHash("sha256");
    let size = 0;
    for await (const chunk of createReadStream(absSource)) {
      hash.update(chunk as Buffer);
      size += (chunk as Buffer).length;
    }
    return { hash: hash.digest("hex"), size };
  }

  /** Move a finished file into `key` (rename, falling back to copy across devices). */
  async moveInto(absSource: string, key: string): Promise<void> {
    const abs = this.absPath(key);
    await this.ensureParent(abs);
    try {
      await fs.rename(absSource, abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        await pipeline(createReadStream(absSource), createWriteStream(abs));
        await fs.rm(absSource, { force: true });
      } else {
        throw err;
      }
    }
  }
}
