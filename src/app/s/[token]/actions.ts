"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveShare } from "@/lib/share";
import { signShareGrant, SHARE_GRANT_COOKIE } from "@/lib/share-grant";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { cookieSecure } from "@/lib/env";

export interface UnlockState {
  error?: string;
}

/** Verify a share password; on success set the signed grant cookie and reload. */
export async function unlockShare(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token || !password) return { error: "Mot de passe requis" };

  const ip = clientIp(await headers());
  const rl = await rateLimit("share-unlock", `${ip}:${token}`, 8, 60);
  if (!rl.ok) return { error: "Trop de tentatives, réessayez plus tard." };

  const state = await resolveShare(token, password);
  if (state.status === "ok") {
    const grant = await signShareGrant(state.share.id);
    (await cookies()).set(SHARE_GRANT_COOKIE, grant, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 2,
    });
    redirect(`/s/${token}`);
  }
  if (state.status === "password") return { error: "Mot de passe incorrect" };
  return { error: "Ce lien n'est plus disponible" };
}
