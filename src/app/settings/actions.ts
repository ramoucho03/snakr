"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import {
  normalizeHandle,
  isValidHandle,
  handleAvailable,
  isValidHex,
} from "@/lib/profile";

type Ok<T = unknown> = { ok: true } & T;
type Fail = { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): Fail => ({ ok: false, error, ...(field ? { field } : {}) });

/**
 * Update the signed-in member's channel profile. Avatar/banner bytes go through
 * the multipart route (/api/profile/[kind]); this handles the text fields.
 */
export async function updateProfileAction(input: {
  displayName: string;
  handle: string;
  bio: string;
  accentColor: string;
}): Promise<Ok | Fail> {
  try {
    const user = await requireUser();

    const displayName = input.displayName.trim().slice(0, 60);
    if (!displayName) return fail("Le nom d'affichage est requis", "displayName");

    const handle = normalizeHandle(input.handle);
    if (handle) {
      if (!isValidHandle(handle)) {
        return fail("3–24 caractères : lettres, chiffres, . ou _", "handle");
      }
      if (!(await handleAvailable(handle, user.id))) {
        return fail("Cet identifiant est déjà pris", "handle");
      }
    }

    const bio = input.bio.trim().slice(0, 600) || null;

    let accentColor: string | null = input.accentColor.trim() || null;
    if (accentColor && !isValidHex(accentColor)) {
      return fail("Couleur invalide", "accentColor");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { displayName, handle, bio, accentColor },
    });

    revalidatePath("/settings");
    revalidatePath(`/channel/${user.id}`);
    return { ok: true };
  } catch (err) {
    return fail((err as Error).message || "Enregistrement impossible");
  }
}
