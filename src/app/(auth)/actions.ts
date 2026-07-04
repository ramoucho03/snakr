"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroyCurrentSession,
  destroyAllSessions,
} from "@/lib/auth";
import { requireUser } from "@/lib/dal";
import { isRegistrationOpen, defaultQuotaBytes } from "@/lib/settings";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  fieldErrors,
} from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/** Return shape consumed by `useActionState` on every auth form. */
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Open-redirect guard: only honour a `next` that points at an in-app,
 * non-protocol-relative path. Anything else falls back to the drive.
 */
function safeNext(next: FormDataEntryValue | null): string {
  if (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    // Browsers treat "\" as "/", so "/\evil.com" resolves off-site. Reject any
    // backslash and any control/whitespace that could smuggle a second slash.
    !next.includes("\\") &&
    !/[\x00-\x1f]/.test(next)
  ) {
    return next;
  }
  return "/drive";
}

export async function login(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const hdrs = await headers();
  const ip = clientIp(hdrs);
  const rl = await rateLimit("login", `${ip}:${parsed.data.email}`, 8, 60);
  if (!rl.ok) {
    return { error: "Trop de tentatives, réessayez plus tard." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, isSuspended: true },
  });
  // Generic message: never reveal whether the email or the password was wrong.
  if (
    !user ||
    !(await verifyPassword(user.passwordHash, parsed.data.password))
  ) {
    return { error: "Identifiants invalides." };
  }
  if (user.isSuspended) {
    return { error: "Compte suspendu." };
  }

  await createSession(user.id, { ip, userAgent: hdrs.get("user-agent") });

  redirect(safeNext(formData.get("next")));
}

export async function register(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isRegistrationOpen())) {
    return { error: "Les inscriptions sont fermées." };
  }

  const hdrs = await headers();
  const ip = clientIp(hdrs);
  const rl = await rateLimit("register", ip, 5, 3600);
  if (!rl.ok) {
    return { error: "Trop de tentatives, réessayez plus tard." };
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return { fieldErrors: { email: "Adresse déjà utilisée" } };
  }

  const quota = await defaultQuotaBytes();
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.password),
      role: "USER",
      storageLimit: quota == null ? null : BigInt(quota),
    },
    select: { id: true },
  });

  await createSession(user.id, { ip, userAgent: hdrs.get("user-agent") });

  redirect("/drive");
}

/** Plain server action (no `useActionState`): revoke the cookie and bounce out. */
export async function logout(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (
    !dbUser ||
    !(await verifyPassword(dbUser.passwordHash, parsed.data.currentPassword))
  ) {
    return { fieldErrors: { currentPassword: "Mot de passe actuel incorrect" } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePw: false,
    },
  });

  // Revoke every session (including any stolen ones), then re-issue for the
  // current browser so the user stays logged in on this device.
  await destroyAllSessions(user.id);
  await createSession(user.id);

  redirect("/drive");
}
