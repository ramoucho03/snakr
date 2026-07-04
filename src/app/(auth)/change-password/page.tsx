import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { GlassCard } from "@/components/ui/glass-card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Changer le mot de passe" };

export default async function ChangePasswordPage() {
  const user = await requireUser();

  return (
    <GlassCard strong sheen className="p-7 sm:p-9">
      <ChangePasswordForm mustChange={user.mustChangePw} />
    </GlassCard>
  );
}
