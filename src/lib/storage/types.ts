import type { Readable } from "node:stream";

/** Inclusive byte range for partial reads (HTTP Range → 206). */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The storage seam. The whole app reads and writes bytes through this — never
 * `fs` directly — so the local-disk backend can be swapped for S3/MinIO later
 * with zero call-site changes. Keys are opaque, forward-slash relative paths
 * (e.g. `blobs/ab/cd/<sha256>`); the provider confines them to its own root.
 */
export interface StorageProvider {
  /** Stream `body` into `key`, hashing as it writes. Overwrites atomically. */
  put(key: string, body: Readable): Promise<{ size: number; hash: string; key: string }>;
  /** A readable of the whole object, or a byte slice when `range` is given. */
  stream(key: string, range?: ByteRange): Promise<Readable>;
  /** Object size, or null if it does not exist. */
  stat(key: string): Promise<{ size: number } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
