'use client';

import { ImagePlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import {
  setLocaleAction,
  updateAboutAction,
  updateProfileAction,
  updateProfileImageAction,
} from '@/app/(app)/reglages/actions';
import { Avatar, Button, Input, Select, Switch, Textarea } from '@/components/verre';
import { PROFILE_AVATARS } from '@/lib/profile-avatars';
import { cn, nb, useTheme } from '@/lib/verre';
import { Row, RowError, Rows, RowsHead } from './reglages';
import { useHeadSlot } from './settings-tabs';

type Membership = { role: string; organizationName: string; since: Date } | null;

// Better Auth peut ranger plusieurs rôles séparés par des virgules.
export const roleLabel = (role: string, labels: Record<string, string>) =>
  role
    .split(',')
    .map((r) => labels[r] ?? r)
    .join(', ');

// setLocaleAction lit un formulaire : le pied du site public s'en sert sans JavaScript.
const localeForm = (locale: string) => {
  const data = new FormData();
  data.set('locale', locale);
  return data;
};

// L'approche de la limite : le compteur ne se montre qu'à 50 caractères d'elle.
const NEAR = 50;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function compactPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > 12_000 || bitmap.height > 12_000) {
    bitmap.close();
    throw new Error('image dimensions');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('image canvas');
  }
  const crop = Math.min(bitmap.width, bitmap.height);
  context.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    128,
    128,
  );
  bitmap.close();
  for (const quality of [0.78, 0.66, 0.54]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob) throw new Error('image encoding');
    if (blob.size <= 24_000) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('image read'));
        };
        reader.onerror = () => reject(new Error('image read'));
        reader.readAsDataURL(blob);
      });
    }
  }
  throw new Error('image too large');
}

/**
 * Le groupe Profil : photo, nom, adresse, « À propos de vous », langue et thème. Le nom et « À propos » s'enregistrent
 * ensemble par la pastille « Enregistrer » du titre ; la photo, la langue et le thème s'appliquent dès qu'on les choisit.
 */
export function ProfileSettings({
  name,
  email,
  image,
  membership,
  about,
  aboutMax,
}: {
  name: string;
  email: string;
  image?: string | null;
  membership: Membership;
  about: string;
  aboutMax: number;
}) {
  const t = useTranslations('security');
  const a = useTranslations('about');
  const s = useTranslations('settings');
  const p = useTranslations('preferences');
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const slot = useHeadSlot();
  const ids = useId();
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  // ce que le serveur tient, et ce qui est tapé
  const [saved, setSaved] = useState({ name, about });
  const [draft, setDraft] = useState({ name, about });
  const [errors, setErrors] = useState<{ name?: string; about?: string }>({});
  const [done, setDone] = useState(false);
  const [profileImage, setProfileImage] = useState(image ?? null);
  const [photoError, setPhotoError] = useState<string>();
  const [photoDone, setPhotoDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [photoPending, startPhotoTransition] = useTransition();
  const [, startLocale] = useTransition();
  const dirty = draft.name !== saved.name || draft.about !== saved.about;

  // « Enregistré » reste un instant, puis la pastille s'en va
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 2400);
    return () => clearTimeout(timer);
  }, [done]);

  // arrivée par /reglages#profil (la suggestion « Dites à Leon qui vous êtes ») : le curseur va à « À propos »
  useEffect(() => {
    if (window.location.hash === '#profil') aboutRef.current?.focus({ preventScroll: true });
  }, []);

  const edit = (patch: Partial<typeof draft>) => {
    setDone(false);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const savePhoto = (next: string | null) => {
    if (photoPending) return;
    setPhotoError(undefined);
    setPhotoDone(false);
    startPhotoTransition(async () => {
      const result = await updateProfileImageAction(next).catch(() => ({
        error: t('photoFailed'),
      }));
      if ('error' in result) {
        setPhotoError(result.error);
        return;
      }
      setProfileImage(next);
      setPhotoDone(true);
    });
  };

  const uploadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setPhotoError(undefined);
    setPhotoDone(false);
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > MAX_PHOTO_BYTES
    ) {
      setPhotoError(t('photoInvalid'));
      return;
    }
    startPhotoTransition(async () => {
      try {
        const next = await compactPhoto(file);
        const result = await updateProfileImageAction(next);
        if ('error' in result) {
          setPhotoError(result.error);
          return;
        }
        setProfileImage(next);
        setPhotoDone(true);
      } catch {
        setPhotoError(t('photoInvalid'));
      }
    });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || pending) return;
    const next = draft;
    const trimmed = next.name.trim();
    if (!trimmed || trimmed.length > 100) return setErrors({ name: t('nameInvalid') });
    setErrors({});
    startTransition(async () => {
      const [named, told] = await Promise.all([
        next.name === saved.name
          ? null
          : updateProfileAction(next.name).catch(() => ({ error: t('profileFailed') })),
        next.about === saved.about
          ? null
          : updateAboutAction(next.about).catch(() => ({ error: a('failed') })),
      ]);
      const failed = {
        name: named && 'error' in named ? named.error : undefined,
        about: told && 'error' in told ? told.error : undefined,
      };
      setErrors(failed);
      setSaved((was) => ({
        name: named && !failed.name ? next.name : was.name,
        about: told && !failed.about ? next.about : was.about,
      }));
      if (!failed.name && !failed.about) setDone(true);
    });
  };

  const role =
    membership &&
    roleLabel(membership.role, { owner: s('owner'), admin: s('admin'), member: s('member') });
  const near = draft.about.length >= aboutMax - NEAR;

  return (
    <>
      {slot &&
        (dirty || pending || done) &&
        createPortal(
          <Button
            type="submit"
            form="profile-form"
            variant="primary"
            loading={pending}
            loadingLabel={s('saving')}
          >
            {done && !dirty ? s('saved') : t('save')}
          </Button>,
          slot,
        )}
      <form id="profile-form" noValidate onSubmit={save}>
        <Rows>
          <RowsHead
            picture={<Avatar name={saved.name} src={profileImage ?? undefined} size={44} />}
            name={<span className={cn('mark', done && 'is-on')}>{saved.name}</span>}
            caption={membership && `${role} · ${membership.organizationName}`}
          />
          <Row label={t('photo')} top>
            <div className="grid max-w-[440px] gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={uploadPhoto}
                  aria-label={t('uploadPhoto')}
                />
                <Button
                  size="sm"
                  icon={ImagePlus}
                  loading={photoPending}
                  loadingLabel={t('photoSaving')}
                  onClick={() => photoRef.current?.click()}
                >
                  {t('uploadPhoto')}
                </Button>
                {profileImage && (
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={photoPending}
                    onClick={() => savePhoto(null)}
                  >
                    {t('useInitials')}
                  </Button>
                )}
              </div>
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="text-label text-muted">{t('chooseAvatar')}</legend>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_AVATARS.map((avatar, index) => (
                    <button
                      key={avatar}
                      type="button"
                      aria-label={t('pixelAvatar', { number: index + 1 })}
                      aria-pressed={profileImage === avatar}
                      disabled={photoPending}
                      onClick={() => savePhoto(avatar)}
                      className={cn(
                        'rounded-full border-2 p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-60',
                        profileImage === avatar
                          ? 'border-ink'
                          : 'border-line hover:border-line-strong',
                      )}
                    >
                      <Avatar name={saved.name} src={avatar} size={32} />
                    </button>
                  ))}
                </div>
              </fieldset>
              {photoError ? (
                <RowError id={`${ids}-photo-e`}>{nb(photoError)}</RowError>
              ) : photoDone ? (
                <p role="status" className="text-label text-muted">
                  {t('photoSaved')}
                </p>
              ) : (
                <p className="text-label text-muted">{t('photoDescription')}</p>
              )}
            </div>
          </Row>
          <Row label={t('name')} htmlFor={`${ids}-name`}>
            <Input
              id={`${ids}-name`}
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
              autoComplete="name"
              maxLength={100}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ids}-name-e` : undefined}
              className="max-w-[440px]"
            />
            <RowError id={`${ids}-name-e`}>{errors.name && nb(errors.name)}</RowError>
          </Row>
          <Row label={t('email')}>
            <span className="text-lead [overflow-wrap:anywhere]">{email}</span>
          </Row>
          <Row label={a('title')} htmlFor={`${ids}-about`} top>
            <Textarea
              ref={aboutRef}
              id={`${ids}-about`}
              value={draft.about}
              onChange={(e) => edit({ about: e.target.value })}
              maxLength={aboutMax}
              rows={3}
              autoGrow
              placeholder={nb(a('placeholder'))}
              aria-invalid={errors.about ? true : undefined}
              aria-describedby={`${ids}-about-h`}
              className="max-w-[440px]"
            />
            {errors.about ? (
              <RowError id={`${ids}-about-h`}>{nb(errors.about)}</RowError>
            ) : (
              <p
                id={`${ids}-about-h`}
                className="mt-1.5 flex max-w-[440px] justify-between gap-4 text-label text-muted"
              >
                <span>{nb(a('description'))}</span>
                {near && (
                  <span className="shrink-0 tabular-nums">
                    {draft.about.length} / {aboutMax}
                  </span>
                )}
              </p>
            )}
          </Row>
          <Row label={p('language')} htmlFor={`${ids}-language`}>
            <Select
              id={`${ids}-language`}
              aria-label={p('language')}
              className="max-w-[440px]"
              defaultValue={locale}
              onValueChange={(value) => startLocale(() => setLocaleAction(localeForm(value)))}
              options={[
                { value: 'en', label: p('english') },
                { value: 'fr', label: p('french') },
              ]}
            />
          </Row>
          <Row label={p('theme')} htmlFor={`${ids}-theme`}>
            <div className="flex items-center gap-3">
              <Switch
                id={`${ids}-theme`}
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
              <span className="text-label text-muted">
                {theme === 'dark' ? p('dark') : p('light')}
              </span>
            </div>
          </Row>
        </Rows>
      </form>
    </>
  );
}
