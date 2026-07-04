import "server-only";
import { z } from "zod";

/**
 * Server environment, validated lazily (never at import) so `next build` can
 * compile without a live DATABASE_URL. First runtime access parses & caches.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 chars"),
  STORAGE_ROOT: z.string().min(1).default("./data/uploads"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  ADMIN_NAME: z.string().optional(),
  APP_URL: z.string().url().optional(),
  FFMPEG_PATH: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isProd = () => process.env.NODE_ENV === "production";
