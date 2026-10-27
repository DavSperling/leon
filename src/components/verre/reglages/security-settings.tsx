'use client';

import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useTransition } from 'react';
import {
  disableTotpAction,
  enableTotpAction,
  regenerateBackupCodesAction,
  updateProfileAction,
  verifyTotpSetupAction,
} from '@/app/(app)/reglages/actions';
import { initialOf } from '@/components/verre/shell/brand';
import { Button } from '@/components/verre/ui/button';
import { CopyButton } from '@/components/verre/ui/copy';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input } from '@/components/verre/ui/form';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { formatDate } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import { roleLabel } from './members';

const read = (data: FormData, name: string) => String(data.get(name) ?? '');

// Les codes de secours ne sont montrés qu'ici, une fois : à l'activation ou quand l'utilisateur en demande d'autres.
function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations('security');
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-label font-semibold text-fg">{t('backupTitle')}</h4>
        <CopyButton value={codes.join('\n')} label={t('copyCodes')} />
      </div>
      <p className="mt-1 text-label text-muted">{nb(t('backupHelp'))}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 rounded-panel bg-surface p-3 font-mono text-label">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}

export function SecuritySettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations('security');
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState('');
  const [pending, startTransition] = useTransition();

  function start(name: string, work: () => Promise<void>) {
    setError('');
    setMessage('');
    setRunning(name);
    startTransition(work);
  }
  const enable = (data: FormData) =>
    start('enable', async () => {
      const result = await enableTotpAction(read(data, 'password'));
      if ('error' in result) setError(result.error);
      else setSetup(result);
    });
  const verify = (data: FormData) =>
    start('verify', async () => {
      const result = await verifyTotpSetupAction(read(data, 'code').replace(/\s/g, ''));
      if ('error' in result) return setError(result.error);
      setSetup(null);
      setMessage(t('enabled'));
    });
  const disable = (data: FormData) =>
    start('disable', async () => {
      const result = await disableTotpAction(read(data, 'password'));
      if ('error' in result) setError(result.error);
      else setMessage(t('disabled'));
    });
  const regenerate = (data: FormData) =>
    start('codes', async () => {
      const result = await regenerateBackupCodesAction(read(data, 'password'));
      if ('error' in result) setError(result.error);
      else setCodes(result.backupCodes);
    });

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="text-title font-semibold text-fg">{t('twoFactorTitle')}</h3>
        <p className="mt-1 text-ui text-muted">{t('twoFactorDescription')}</p>
      </div>
      {message && (
        <Notice tone="success" live="status">
          {nb(message)}
        </Notice>
      )}
      {error && (
        <Notice tone="error" live="alert">
          {nb(error)}
        </Notice>
      )}
      {setup ? (
        <div className="grid gap-4 rounded-panel border border-line p-5">
          <p className="text-ui text-fg-2">{t('scan')}</p>
          <div className="w-fit rounded-panel bg-white p-3">
            <QRCodeSVG value={setup.uri} size={192} />
          </div>
          <details>
            <summary className="cursor-pointer text-label text-accent">{t('showKey')}</summary>
            <code className="mt-2 block break-all text-label">
              {new URL(setup.uri).searchParams.get('secret')}
            </code>
          </details>
          <BackupCodes codes={setup.backupCodes} />
          <form action={verify} className="flex flex-wrap items-end gap-3">
            <Field label={t('code')}>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </Field>
            <Button type="submit" variant="primary" loading={pending && running === 'verify'}>
              {t('activate')}
            </Button>
          </form>
        </div>
      ) : codes ? (
        <div className="grid gap-4 rounded-panel border border-line p-5">
          <BackupCodes codes={codes} />
          <Button variant="secondary" className="w-fit" onClick={() => setCodes(null)}>
            {t('codesSaved')}
          </Button>
        </div>
      ) : enabled ? (
        <form className="flex flex-wrap items-end gap-3">
          <p className="w-full text-ui text-fg-2">{t('enabledNotice')}</p>
          <Field label={t('password')} help={t('regenerateHelp')}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            formAction={regenerate}
            loading={pending && running === 'codes'}
          >
            {t('regenerate')}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            formAction={disable}
            loading={pending && running === 'disable'}
          >
            {t('disable')}
          </Button>
        </form>
      ) : (
        <form action={enable} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-ui text-fg-2">{t('notConfigured')}</p>
          <Field label={t('password')}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" variant="primary" loading={pending && running === 'enable'}>
            {t('configure')}
          </Button>
        </form>
      )}
    </div>
  );
}

type Membership = { role: string; organizationName: string; since: Date } | null;

export function ProfileSettings({
  name,
  email,
  membership,
}: {
  name: string;
  email: string;
  membership: Membership;
}) {
  const t = useTranslations('security');
  const roles = useTranslations('settings');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid max-w-md gap-6">
      <GlassCard className="flex items-center gap-4 p-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[18px] font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]"
        >
          {initialOf(name)}
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold [overflow-wrap:anywhere] text-fg">{name}</p>
          {membership && (
            <p className="mt-0.5 text-label text-muted">
              {t('membership', {
                role: roleLabel(membership.role, {
                  owner: roles('owner'),
                  admin: roles('admin'),
                  member: roles('member'),
                }),
                organization: membership.organizationName,
                // la date ne se coupe pas en deux sur un écran étroit
                date: formatDate(membership.since, locale).replaceAll(' ', '\u00a0'),
              })}
            </p>
          )}
        </div>
      </GlassCard>
      <form
        action={(data) => {
          setError('');
          setStatus('');
          startTransition(async () => {
            const result = await updateProfileAction(read(data, 'name'));
            if ('error' in result) setError(result.error);
            else setStatus(t('profileSaved'));
          });
        }}
        className="grid gap-4"
      >
        <Field label={t('name')}>
          <Input name="name" defaultValue={name} autoComplete="name" required maxLength={100} />
        </Field>
        <Field label={t('email')}>
          <Input value={email} readOnly type="email" />
        </Field>
        {status && (
          <Notice tone="success" live="status">
            {status}
          </Notice>
        )}
        {error && (
          <Notice tone="error" live="alert">
            {error}
          </Notice>
        )}
        <Button type="submit" variant="primary" loading={pending} className="w-fit">
          {t('save')}
        </Button>
      </form>
    </div>
  );
}
