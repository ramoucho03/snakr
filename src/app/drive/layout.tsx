import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { storageSummary } from "@/lib/files";
import { AppHeader } from "@/components/layout/app-header";
import { DriveTabs } from "@/components/drive/drive-tabs";

export const metadata = { title: "Mon drive" };

export default async function DriveLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Force the password rotation before anything else is reachable.
  if (user.mustChangePw) redirect("/change-password");

  const { used, limit } = await storageSummary(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        user={{ email: user.email, displayName: user.displayName, role: user.role }}
        used={used}
        limit={limit}
      />
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <DriveTabs />
        {children}
      </main>
    </div>
  );
}
