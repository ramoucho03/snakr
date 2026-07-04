import type { Metadata } from "next";
import { Users, Files, HardDrive } from "lucide-react";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { allSettings } from "@/lib/settings";
import { formatBytes } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { SettingsForm } from "@/components/admin/settings-form";
import { UsersTable, type AdminUserRow } from "@/components/admin/users-table";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [userCount, fileCount, storageAgg, settings, users] = await Promise.all([
    prisma.user.count(),
    prisma.file.count(),
    prisma.blob.aggregate({ _sum: { size: true } }),
    allSettings(),
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isSuspended: true,
        storageUsed: true,
        storageLimit: true,
        createdAt: true,
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const totalStorage = Number(storageAgg._sum.size ?? 0);

  // bigint isn't serializable across the RSC boundary — map to a plain DTO.
  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isSuspended: u.isSuspended,
    storageUsed: Number(u.storageUsed),
    storageLimit: u.storageLimit == null ? null : Number(u.storageLimit),
    createdAt: u.createdAt.toISOString(),
    fileCount: u._count.files,
  }));

  return (
    <div className="flex flex-col gap-8">
      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={<Users size={20} aria-hidden />}
          label="Utilisateurs"
          value={String(userCount)}
        />
        <StatTile
          icon={<Files size={20} aria-hidden />}
          label="Fichiers"
          value={String(fileCount)}
        />
        <StatTile
          icon={<HardDrive size={20} aria-hidden />}
          label="Stockage utilisé"
          value={formatBytes(totalStorage)}
        />
      </section>

      {/* Settings */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text-hi">Paramètres</h2>
          <p className="text-sm text-text-faint">
            Inscriptions et quota appliqué aux nouveaux comptes.
          </p>
        </div>
        <SettingsForm initial={settings} />
      </section>

      {/* Users */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text-hi">
            Utilisateurs
            <span className="ml-2 text-sm font-normal text-text-faint">{rows.length}</span>
          </h2>
          <p className="text-sm text-text-faint">
            Gérer les rôles, quotas et l&apos;accès de chaque compte.
          </p>
        </div>
        <UsersTable users={rows} currentAdminId={admin.id} />
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="flex items-center gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-glass text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-text-faint">{label}</p>
        <p className="font-display text-2xl font-semibold text-text-hi">{value}</p>
      </div>
    </GlassCard>
  );
}
