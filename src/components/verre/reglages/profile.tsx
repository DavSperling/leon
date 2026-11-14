'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  setLocaleAction,
  updateAboutAction,
  updateProfileAction,
} from '@/app/(app)/reglages/actions';
import { Avatar, Button, Input, Select, Textarea } from '@/components/verre';
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

/**
 * Le groupe Profil : une feuille (la personne, son nom, son adresse, « À propos de vous », la langue, le thème). Le nom
 * et « À propos » s'enregistrent ensemble par la pastille « Enregistrer » du titre, qui ne paraît que si l'un a changé ;
 * la langue et le thème s'appliquent dès qu'on les choisit.
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
  // ce que le serveur tient, et ce qui est tapé
  const [saved, setSaved] = useState({ name, about });
  const [draft, setDraft] = useState({ name, about });
  const [errors, setErrors] = useState<{ name?: string; about?: string }>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
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
            picture={<Avatar name={saved.name} src={image ?? undefined} size={44} />}
            name={<span className={cn('mark', done && 'is-on')}>{saved.name}</span>}
            caption={membership && `${role} · ${membership.organizationName}`}
          />
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
            <Select
              id={`${ids}-theme`}
              aria-label={p('theme')}
              className="max-w-[440px]"
              value={theme}
              onValueChange={(value) => setTheme(value === 'dark' ? 'dark' : 'light')}
              options={[
                { value: 'light', label: p('light') },
                { value: 'dark', label: p('dark') },
              ]}
            />
          </Row>
        </Rows>
      </form>
    </>
  );
}
