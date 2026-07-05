"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, RotateCcw, Trash2, Tv } from "lucide-react";
import type { EditableProfile } from "@/lib/profile";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateProfileAction } from "@/app/settings/actions";

type ImageKind = "avatar" | "banner";
type FieldKey = "displayName" | "handle" | "accentColor";

const MAX_UPLOAD = 15 * 1024 * 1024; // 15 MB
const DEFAULT_SWATCH = "#c7b284"; // tan — shown in the picker while accent is unset

export function ProfileEditor({
  userId,
  profile,
}: {
  userId: string;
  profile: EditableProfile;
}) {
  const router = useRouter();

  // Text fields
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [accentColor, setAccentColor] = useState(profile.accentColor ?? "");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, startTransition] = useTransition();

  // Media
  const [busy, setBusy] = useState<{ avatar: boolean; banner: boolean }>({
    avatar: false,
    banner: false,
  });
  const [version, setVersion] = useState(0); // bumps to cache-bust previews
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const channelHref = `/channel/${profile.handle ?? userId}`;
  const bannerSrc = `/api/users/${userId}/banner?v=${version}`;
  const previewHandle = handle.trim().replace(/^@+/, "").toLowerCase() || "votre-identifiant";

  async function handleUpload(kind: ImageKind, file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image.");
      return;
    }
    if (file.size > MAX_UPLOAD) {
      toast.error("Image trop lourde (15 Mo maximum).");
      return;
    }
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/profile/${kind}`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Envoi impossible.");
        return;
      }
      toast.success(kind === "avatar" ? "Photo mise à jour." : "Bannière mise à jour.");
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      toast.error("Envoi impossible.");
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
    }
  }

  async function handleRemove(kind: ImageKind) {
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      const res = await fetch(`/api/profile/${kind}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Suppression impossible.");
        return;
      }
      toast.success(kind === "avatar" ? "Photo supprimée." : "Bannière supprimée.");
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      toast.error("Suppression impossible.");
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
    }
  }

  function onPick(kind: ImageKind) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-picking the same file
      if (file) void handleUpload(kind, file);
    };
  }

  function onReset() {
    setDisplayName(profile.displayName);
    setHandle(profile.handle ?? "");
    setBio(profile.bio ?? "");
    setAccentColor(profile.accentColor ?? "");
    setErrors({});
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await updateProfileAction({
        displayName,
        handle: handle ?? "",
        bio: bio ?? "",
        accentColor: accentColor ?? "",
      });
      if (!res.ok) {
        if (res.field) setErrors({ [res.field as FieldKey]: res.error });
        toast.error(res.error);
        return;
      }
      toast.success("Profil enregistré");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl text-text-hi sm:text-4xl">Paramètres</h1>
          <p className="text-sm text-text-lo">Personnalisez votre chaîne et votre profil.</p>
        </div>
        <Link href={channelHref} className={buttonClass({ variant: "outline", size: "sm" })}>
          <Tv size={16} aria-hidden />
          Voir ma chaîne
        </Link>
      </div>

      {/* Banner + avatar */}
      <section className="glass glass-sheen rounded-2xl p-4 sm:p-5">
        {/* Banner strip */}
        <div className="relative h-36 overflow-hidden rounded-xl sm:h-44">
          {profile.hasBanner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerSrc} alt="Bannière de la chaîne" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-tan/25 via-bg-1 to-smoke/20" />
          )}
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => bannerInput.current?.click()}
              disabled={busy.banner}
            >
              {busy.banner ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <ImagePlus size={14} aria-hidden />
              )}
              Changer la bannière
            </Button>
            {profile.hasBanner && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => handleRemove("banner")}
                disabled={busy.banner}
              >
                <Trash2 size={14} aria-hidden />
                <span className="sr-only sm:not-sr-only">Supprimer</span>
              </Button>
            )}
          </div>
        </div>

        {/* Avatar overlapping the banner */}
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-1 sm:-mt-12">
          <div className="rounded-full ring-4 ring-bg-0">
            <Avatar
              key={`avatar-${version}`}
              userId={userId}
              name={displayName || profile.email}
              hasAvatar={profile.hasAvatar}
              size={96}
              ring
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => avatarInput.current?.click()}
              disabled={busy.avatar}
            >
              {busy.avatar ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Camera size={14} aria-hidden />
              )}
              Changer la photo
            </Button>
            {profile.hasAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove("avatar")}
                disabled={busy.avatar}
              >
                <Trash2 size={14} aria-hidden />
                Supprimer
              </Button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-text-faint">
          Bannière 1600×400 · Avatar carré · Images, 15 Mo max.
        </p>

        <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onPick("avatar")} />
        <input ref={bannerInput} type="file" accept="image/*" hidden onChange={onPick("banner")} />
      </section>

      {/* Profile form */}
      <form
        onSubmit={onSubmit}
        className="glass glass-sheen flex flex-col gap-5 rounded-2xl p-4 sm:p-6"
      >
        <div className="space-y-1">
          <h2 className="font-display text-lg text-text-hi">Profil</h2>
          <p className="text-xs text-text-faint">Connecté en tant que {profile.email}</p>
        </div>

        {/* Display name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-sm font-medium text-text-lo">
            Nom d&apos;affichage <span className="text-danger">*</span>
          </label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Votre nom"
            required
            maxLength={60}
            aria-invalid={errors.displayName ? true : undefined}
          />
          {errors.displayName && <p className="text-xs text-danger">{errors.displayName}</p>}
        </div>

        {/* Handle */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="handle" className="text-sm font-medium text-text-lo">
            Identifiant
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-faint">
              @
            </span>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="votre-identifiant"
              className="pl-7"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={errors.handle ? true : undefined}
            />
          </div>
          {errors.handle ? (
            <p className="text-xs text-danger">{errors.handle}</p>
          ) : (
            <p className="text-xs text-text-faint">
              snakr.app/channel/@{previewHandle} · 3–24 caractères : a–z, 0–9, . ou _
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="bio" className="text-sm font-medium text-text-lo">
              Bio
            </label>
            <span className="tabular text-xs text-text-faint">{bio.length}/600</span>
          </div>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={600}
            rows={4}
            placeholder="Présentez votre chaîne en quelques mots…"
            className="w-full resize-y rounded-lg border border-glass-border bg-bg-0/40 px-3 py-2 text-sm text-text-hi outline-none focus:border-accent/60"
          />
        </div>

        {/* Accent color */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="accentHex" className="text-sm font-medium text-text-lo">
            Couleur d&apos;accent
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Sélecteur de couleur"
              value={accentColor || DEFAULT_SWATCH}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-glass-border bg-bg-0/40 p-1"
            />
            <Input
              id="accentHex"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#c7b284"
              className="max-w-40 tabular"
              aria-invalid={errors.accentColor ? true : undefined}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setAccentColor("")}>
              <RotateCcw size={14} aria-hidden />
              Réinitialiser
            </Button>
          </div>
          {errors.accentColor && <p className="text-xs text-danger">{errors.accentColor}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-glass-border pt-4">
          <Button type="button" variant="ghost" onClick={onReset} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  );
}
