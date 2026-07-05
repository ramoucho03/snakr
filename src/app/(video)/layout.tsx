import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { storageSummary } from "@/lib/files";
import { AppHeader } from "@/components/layout/app-header";

/**
 * The video section — a wider, immersive layout than the drive. Reuses the same
 * authenticated header + guards (auth, forced password rotation) so the two
 * sections feel like one product.
 */
export default async function VideoLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePw) redirect("/change-password");

  const { used, limit } = await storageSummary(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        wide
        user={{ email: user.email, displayName: user.displayName, role: user.role }}
        used={used}
        limit={limit}
      />
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
