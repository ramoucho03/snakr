import { requireUser } from "@/lib/dal";
import { getEditableProfile } from "@/lib/profile";
import { ProfileEditor } from "@/components/settings/profile-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getEditableProfile(user.id);
  if (!profile) return null;
  return <ProfileEditor userId={user.id} profile={profile} />;
}
