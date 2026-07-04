"use server";

import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { destroyAllSessions } from "@/lib/auth";
import { setSetting, SETTINGS } from "@/lib/settings";
import {
  adminUpdateUserSchema,
  adminSettingsSchema,
  type AdminUpdateUserInput,
  type AdminSettingsInput,
} from "@/lib/validation";

type ActionResult = { ok: true } | { ok: false; error: string };

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Une erreur inattendue est survenue.";
}

/**
 * Update a user's role / suspension / quota. Admin-only. An admin can never
 * suspend or demote themselves (they'd lock themselves out). Suspending also
 * destroys the target's sessions so the ban takes effect immediately.
 */
export async function updateUser(input: AdminUpdateUserInput): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const parsed = adminUpdateUserSchema.parse(input);

    // Self-protection: cannot suspend or demote your own account.
    if (parsed.userId === admin.id && (parsed.isSuspended === true || parsed.role === "USER")) {
      return {
        ok: false,
        error: "Vous ne pouvez pas suspendre ni rétrograder votre propre compte.",
      };
    }

    const data: Prisma.UserUpdateInput = {};
    if (parsed.role !== undefined) data.role = parsed.role;
    if (parsed.isSuspended !== undefined) data.isSuspended = parsed.isSuspended;
    if (parsed.storageLimitBytes !== undefined) {
      data.storageLimit =
        parsed.storageLimitBytes === null ? null : BigInt(parsed.storageLimitBytes);
    }

    await prisma.user.update({ where: { id: parsed.userId }, data });

    // Instant revocation on ban.
    if (parsed.isSuspended === true) {
      await destroyAllSessions(parsed.userId);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Update global settings: open/close self-registration and the default per-user
 * quota (bytes; null = unlimited). Admin-only.
 */
export async function updateSettings(input: AdminSettingsInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = adminSettingsSchema.parse(input);

    if (parsed.registrationOpen !== undefined) {
      await setSetting(SETTINGS.registrationOpen, String(parsed.registrationOpen));
    }
    if (parsed.defaultQuotaBytes !== undefined) {
      await setSetting(
        SETTINGS.defaultQuotaBytes,
        parsed.defaultQuotaBytes == null ? "" : String(parsed.defaultQuotaBytes),
      );
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}
