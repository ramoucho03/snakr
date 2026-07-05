import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { GlassCard } from "@/components/ui/glass-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/drive");

  const { next } = await props.searchParams;

  return (
    <GlassCard strong sheen className="p-6 sm:p-9">
      <LoginForm next={next} />
    </GlassCard>
  );
}
