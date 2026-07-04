import "server-only";
import { serverEnv } from "../env";
import { LocalDiskProvider } from "./local";

export type { ByteRange, StorageProvider } from "./types";

let instance: LocalDiskProvider | null = null;

/**
 * The process-wide storage backend. Local disk today; to move to S3/MinIO,
 * swap this factory for an `S3Provider` — no other file changes needed.
 */
export function storage(): LocalDiskProvider {
  if (!instance) instance = new LocalDiskProvider(serverEnv().STORAGE_ROOT);
  return instance;
}

/** Content-addressed blob key: `blobs/ab/cd/<sha256>` (2-level fan-out). */
export function blobKey(hash: string): string {
  return `blobs/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

/** Derived-asset key (thumbnail / poster), sharded like blobs and cache-friendly. */
export function derivedKey(hash: string, kind: string, ext: string): string {
  return `derived/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${kind}.${ext}`;
}

/** Where the tus datastore writes in-progress uploads (a subdir of the root). */
export function tusUploadDir(): string {
  return storage().absPath("uploads/incoming");
}
