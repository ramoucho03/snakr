import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { storageSummary } from "@/lib/files";
import { AppHeader } from "@/components/layout/app-header";

export const metadata = { title: "Paramètres" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePw) redirect("/change-password");
  const { used, limit } = await storageSummary(user.id);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        user={{ id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatarKey: user.avatarKey, handle: user.handle }}
        used={used}
        limit={limit}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
