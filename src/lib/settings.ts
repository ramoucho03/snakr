import "server-only";
import { prisma } from "./db";

/**
 * Global key/value settings (registration toggle, default quota, …). Small and
 * rarely written, so we just read straight from Postgres. Unknown keys fall
 * back to sensible, self-host-friendly defaults.
 */

export const SETTINGS = {
  registrationOpen: "registration_open",
  defaultQuotaBytes: "default_quota_bytes",
} as const;

async function raw(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Whether self-service sign-up is allowed. Default: closed (admin-invites). */
export async function isRegistrationOpen(): Promise<boolean> {
  return (await raw(SETTINGS.registrationOpen)) === "true";
}

/** Default per-user quota applied to new accounts, or null for unlimited. */
export async function defaultQuotaBytes(): Promise<number | null> {
  const v = await raw(SETTINGS.defaultQuotaBytes);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function allSettings(): Promise<{
  registrationOpen: boolean;
  defaultQuotaBytes: number | null;
}> {
  const [registrationOpen, quota] = await Promise.all([
    isRegistrationOpen(),
    defaultQuotaBytes(),
  ]);
  return { registrationOpen, defaultQuotaBytes: quota };
}
