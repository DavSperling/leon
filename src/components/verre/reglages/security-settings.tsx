'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { type FormEvent, type ReactNode, useId, useState, useTransition } from 'react';
import {
  changePasswordAction,
  disableTotpAction,
  enableTotpAction,
  regenerateBackupCodesAction,
  verifyTotpSetupAction,
} from '@/app/(app)/reglages/actions';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  PanelClose,
  PanelDone,
  SidePanel,
  StatusRow,
} from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import { Glyph, Row, RowState, Rows } from './reglages';

const read = (data: FormData, name: string) => String(data.get(name) ?? '');

/** Le groupe Sécurité : le mot de passe et l'authentification à deux facteurs, chacun dans son panneau. */
export function SecuritySettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations('security');
  const s = useTranslations('settings');
  const [open, setOpen] = useState<'password' | 'tfa' | null>(null);
  // une clé neuve à chaque ouverture : un mot de passe tapé, des codes montrés ne survivent pas à la fermeture
  const [session, setSession] = useState(0);
  const show = (panel: 'password' | 'tfa') => {
    setSession((n) => n + 1);
    setOpen(panel);
  };
  const onOpenChange = (next: boolean) => !next && setOpen(null);
  return (
    <>
      <Rows>
        <Row
          label={t('passwordTitle')}
          action={
            <Button size="sm" onClick={() => show('password')}>
              {t('changePassword')}
            </Button>
          }
        />
        <Row
          label={t('twoFactorTitle')}
          action={
            <Button
              size="sm"
              onClick={() => show('tfa')}
              aria-label={`${enabled ? s('manage') : s('setUp')} · ${t('twoFactorTitle')}`}
            >
              {enabled ? s('manage') : s('setUp')}
            </Button>
          }
        >
          <RowState>{enabled ? t('stateOn') : t('stateOff')}</RowState>
        </Row>
      </Rows>
      <PasswordPanel key={`p${session}`} open={open === 'password'} onOpenChange={onOpenChange} />
      <TwoFactorPanel
        key={`t${session}`}
        open={open === 'tfa'}
        onOpenChange={onOpenChange}
        enabled={enabled}
      />
    </>
  );
}

type PanelProps = { open: boolean; onOpenChange: (open: boolean) => void };

function PasswordPanel({ open, onOpenChange }: PanelProps) {
  const t = useTranslations('security');
  const auth = useTranslations('auth');
  const s = useTranslations('settings');
  const id = useId();
  const [errors, setErrors] = useState<{ current?: string; password?: string; again?: string }>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const [current, password, again] = ['current', 'password', 'confirmation'].map((n) =>
      read(data, n),
    ) as [string, string, string];
    // les mêmes refus que le serveur, sous le champ qu'ils concernent
    if (password.length < 8 || password.length > 128)
      return setErrors({ password: auth('passwordLength') });
    if (password !== again) return setErrors({ again: auth('passwordsMismatch') });
    setErrors({});
    startTransition(async () => {
      const result = await changePasswordAction(current, password, again).catch(() => ({
        error: t('wrongPassword'),
      }));
      if (!('error' in result)) return setDone(true);
      if (result.error === auth('passwordLength')) setErrors({ password: result.error });
      else if (result.error === auth('passwordsMismatch')) setErrors({ again: result.error });
      else setErrors({ current: result.error });
    });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<Glyph icon={KeyRound} size={44} />}
      title={t('passwordTitle')}
      busy={pending}
      // pendant le changement, ne pas fermer : la réponse (fait, ou refusé) doit se lire
      locked={pending}
      note={done ? undefined : t('othersWillSignOut')}
      foot={
        done ? undefined : (
          <>
            <Button
              type="submit"
              form={`${id}-form`}
              variant="primary"
              loading={pending}
              loadingLabel={t('changing')}
            >
              {t('changePassword')}
            </Button>
            <PanelClose asChild>
              <Button variant="quiet">{s('cancel')}</Button>
            </PanelClose>
          </>
        )
      }
    >
      {done ? (
        <PanelDone title={t('passwordDone')}>{t('othersSignedOut')}</PanelDone>
      ) : (
        <form id={`${id}-form`} noValidate onSubmit={submit} className="grid gap-3.5">
          <Field label={t('currentPassword')} error={errors.current}>
            <Input name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label={t('newPassword')} help={t('passwordHint')} error={errors.password}>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </Field>
          <Field label={t('confirmPassword')} error={errors.again}>
            <Input name="confirmation" type="password" autoComplete="new-password" required />
          </Field>
        </form>
      )}
    </SidePanel>
  );
}

// Les codes de secours ne sont montrés qu'ici, une fois : à l'activation ou quand l'utilisateur en demande d'autres.
function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations('security');
  return (
    <div className="border-t border-line py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lead font-semibold">{t('backupTitle')}</h3>
        <CopyButton value={codes.join('\n')} label={t('copyCodes')} size="xs" />
      </div>
      <p className="mt-1 text-label text-muted">{nb(t('backupHelp'))}</p>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-item bg-glass-3 px-4 py-2.5 font-mono text-ui tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}

type View =
  | { kind: 'ask' } // éteinte : le mot de passe, pour commencer
  | { kind: 'setup'; uri: string; backupCodes: string[] } // le code à scanner, les codes de secours, le code à 6 chiffres
  | { kind: 'manage' } // allumée : nouveaux codes, ou l'éteindre
  | { kind: 'codes'; backupCodes: string[] } // les nouveaux codes, montrés une fois
  | { kind: 'done'; on: boolean };

/**
 * L'authentification à deux facteurs, comme le produit la fait : le mot de passe, puis le vrai code QR et les codes de
 * secours (étape verrouillée : ni Échap ni un clic dehors ne la ferment), puis le code de l'application. Allumée : de
 * nouveaux codes de secours, ou l'éteindre. L'état allumé ou éteint vient de la page (`enabled`).
 */
function TwoFactorPanel({ open, onOpenChange, enabled }: PanelProps & { enabled: boolean }) {
  const t = useTranslations('security');
  const s = useTranslations('settings');
  const id = useId();
  const [view, setView] = useState<View>(enabled ? { kind: 'manage' } : { kind: 'ask' });
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [running, setRunning] = useState('');
  const [pending, startTransition] = useTransition();

  const run = (name: string, work: () => Promise<void>) => {
    setError('');
    setRunning(name);
    startTransition(async () => {
      try {
        await work();
      } catch {
        setError(t('enableFailed'));
      }
    });
  };
  const busy = (name: string) => pending && running === name;

  const enable = (event: FormEvent) => {
    event.preventDefault();
    run('enable', async () => {
      const result = await enableTotpAction(password);
      if ('error' in result) setError(result.error);
      else setView({ kind: 'setup', ...result });
    });
  };
  const verify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = read(new FormData(event.currentTarget), 'code').replace(/\s/g, '');
    run('verify', async () => {
      const result = await verifyTotpSetupAction(code);
      if ('error' in result) setError(result.error);
      else setView({ kind: 'done', on: true });
    });
  };
  const disable = () =>
    run('disable', async () => {
      const result = await disableTotpAction(password);
      if ('error' in result) setError(result.error);
      else setView({ kind: 'done', on: false });
    });
  const regenerate = () =>
    run('codes', async () => {
      const result = await regenerateBackupCodesAction(password);
      if ('error' in result) setError(result.error);
      else {
        setPassword('');
        setView({ kind: 'codes', backupCodes: result.backupCodes });
      }
    });

  const passwordField = (help?: string) => (
    <Field label={t('password')} help={help} error={error || undefined}>
      <Input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
    </Field>
  );

  // verrouillé aussi pendant l'action : fermer à ce moment-là ferait perdre les codes, montrés une seule fois
  const locked = view.kind === 'setup' || view.kind === 'codes' || pending;
  let body: ReactNode;
  let foot: ReactNode;
  if (view.kind === 'done') {
    body = (
      <PanelDone title={view.on ? t('enabledTitle') : t('disabledTitle')}>
        {view.on ? t('othersSignedOut') : undefined}
      </PanelDone>
    );
  } else if (view.kind === 'ask') {
    body = (
      <form id={`${id}-form`} noValidate onSubmit={enable}>
        {passwordField()}
      </form>
    );
    foot = (
      <>
        <Button
          type="submit"
          form={`${id}-form`}
          variant="primary"
          loading={busy('enable')}
          loadingLabel={t('checking')}
          disabled={!password}
        >
          {t('continue')}
        </Button>
        <PanelClose asChild>
          <Button variant="quiet">{s('cancel')}</Button>
        </PanelClose>
      </>
    );
  } else if (view.kind === 'setup') {
    body = (
      <>
        <p className="text-ui text-fg-2">{t('scan')}</p>
        <div className="mt-3 mb-4 flex items-start gap-5 max-sm:flex-col">
          {/* le vrai code, sur blanc dans les deux thèmes : un téléphone le lit */}
          <div className="shrink-0 rounded-item border border-line bg-white p-2">
            <QRCodeSVG value={view.uri} size={152} />
          </div>
          <details className="pt-1.5 text-ui">
            <summary className="cursor-pointer font-medium underline decoration-line-strong underline-offset-4 hover:decoration-fg">
              {t('showKey')}
            </summary>
            <code className="mt-2 block font-mono text-label break-all text-fg">
              {new URL(view.uri).searchParams.get('secret')}
            </code>
          </details>
        </div>
        <BackupCodes codes={view.backupCodes} />
        <form
          id={`${id}-verify`}
          noValidate
          onSubmit={verify}
          className="border-t border-line pt-4"
        >
          <Field label={t('code')} error={error || undefined}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              data-autofocus=""
              onChange={(e) => {
                e.target.value = e.target.value.replace(/[^\d\s]/g, '');
              }}
              className="max-w-[200px] tabular-nums"
            />
          </Field>
        </form>
      </>
    );
    foot = (
      <>
        <Button
          type="submit"
          form={`${id}-verify`}
          variant="primary"
          loading={busy('verify')}
          loadingLabel={t('turningOn')}
        >
          {t('activate')}
        </Button>
        <PanelClose asChild>
          <Button variant="quiet">{s('cancel')}</Button>
        </PanelClose>
      </>
    );
  } else if (view.kind === 'codes') {
    body = <BackupCodes codes={view.backupCodes} />;
    foot = (
      <Button variant="primary" className="ml-auto" onClick={() => setView({ kind: 'manage' })}>
        {t('codesSaved')}
      </Button>
    );
  } else {
    body = (
      <>
        <StatusRow>
          <Badge tone="success">{t('stateOn')}</Badge>
        </StatusRow>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            regenerate();
          }}
          className="mt-4"
        >
          {passwordField(t('regenerateHelp'))}
        </form>
      </>
    );
    foot = (
      <>
        <Button
          variant="quiet"
          className="-ml-4"
          disabled={!password || pending}
          loading={busy('disable')}
          loadingLabel={t('turningOff')}
          onClick={disable}
        >
          {t('disable')}
        </Button>
        <Button
          disabled={!password || pending}
          loading={busy('codes')}
          loadingLabel={t('checking')}
          onClick={regenerate}
        >
          {t('regenerate')}
        </Button>
        <PanelClose asChild>
          <Button variant="secondary" className="ml-auto">
            {s('done')}
          </Button>
        </PanelClose>
      </>
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<Glyph icon={ShieldCheck} size={44} />}
      title={t('twoFactorTitle')}
      sub={t('twoFactorDescription')}
      locked={locked}
      busy={pending}
      foot={foot}
    >
      {body}
    </SidePanel>
  );
}
