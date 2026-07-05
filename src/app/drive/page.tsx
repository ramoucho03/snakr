import { requireUser } from "@/lib/dal";
import { listFolder } from "@/lib/files";
import { dashboardStats } from "@/lib/dashboard";
import { DashboardHero } from "@/components/drive/dashboard-hero";
import { DriveView } from "@/components/drive/drive-view";

export const dynamic = "force-dynamic";

/** Time-aware greeting from the server clock (single-node self-host → local time). */
function greetingFor(hour: number): string {
  if (hour < 6) return "Bonne nuit";
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default async function DrivePage() {
  const user = await requireUser();
  const [{ folders, files }, stats] = await Promise.all([
    listFolder(user.id, null),
    dashboardStats(user.id),
  ]);

  const name = user.displayName?.trim() || user.email.split("@")[0];
  const greeting = greetingFor(new Date().getHours());

  return (
    <div className="flex flex-col gap-8">
      <DashboardHero name={name} greeting={greeting} stats={stats} />
      <DriveView folderId={null} folders={folders} files={files} />
    </div>
  );
}
