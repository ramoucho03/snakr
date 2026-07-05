import { z } from "zod";

/**
 * Server-side input contracts. Every Server Action / Route Handler parses its
 * input through one of these before touching the DB — the client is never
 * trusted, mirroring the DAL authz boundary.
 */

const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide");
const password = z
  .string()
  .min(10, "Au moins 10 caractères")
  .max(200, "200 caractères maximum");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Mot de passe requis").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email,
  displayName: z.string().trim().min(1, "Nom requis").max(80),
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: password,
    confirm: z.string().min(1).max(200),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const itemName = z
  .string()
  .trim()
  .min(1, "Nom requis")
  .max(200, "200 caractères maximum")
  .refine((n) => !n.includes("/") && !n.includes("\\"), "Caractères interdits");

export const createFolderSchema = z.object({
  name: itemName,
  parentId: z.string().cuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide")
    .nullable()
    .optional(),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const renameSchema = z.object({
  id: z.string().cuid(),
  type: z.enum(["FILE", "FOLDER"]),
  name: itemName,
});
export type RenameInput = z.infer<typeof renameSchema>;

export const moveSchema = z.object({
  id: z.string().cuid(),
  type: z.enum(["FILE", "FOLDER"]),
  targetFolderId: z.string().cuid().nullable(),
});
export type MoveInput = z.infer<typeof moveSchema>;

const bulkItems = z
  .array(z.object({ id: z.string().cuid(), type: z.enum(["FILE", "FOLDER"]) }))
  .min(1, "Sélection vide")
  .max(200, "200 éléments maximum à la fois");

export const bulkDeleteSchema = z.object({ items: bulkItems });
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;

export const bulkMoveSchema = z.object({
  items: bulkItems,
  targetFolderId: z.string().cuid().nullable(),
});
export type BulkMoveInput = z.infer<typeof bulkMoveSchema>;

export const createShareSchema = z.object({
  fileId: z.string().cuid().nullable().optional(),
  folderId: z.string().cuid().nullable().optional(),
  password: z.string().min(1).max(200).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  maxDownloads: z.number().int().min(1).max(1_000_000).nullable().optional(),
  allowUpload: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const grantAccessSchema = z.object({
  resourceType: z.enum(["FILE", "FOLDER"]),
  resourceId: z.string().cuid(),
  email,
  level: z.enum(["READ", "WRITE"]),
});
export type GrantAccessInput = z.infer<typeof grantAccessSchema>;

export const unlockShareSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(200),
});
export type UnlockShareInput = z.infer<typeof unlockShareSchema>;

export const adminUpdateUserSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  isSuspended: z.boolean().optional(),
  storageLimitBytes: z.number().int().min(0).nullable().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminSettingsSchema = z.object({
  registrationOpen: z.boolean().optional(),
  defaultQuotaBytes: z.number().int().min(0).nullable().optional(),
});
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

/** Flatten a ZodError into `{ field: message }` for form display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
