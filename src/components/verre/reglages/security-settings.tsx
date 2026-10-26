'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState, useTransition } from 'react';
import {
  disableTotpAction,
  enableTotpAction,
  updateProfileAction,
  verifyTotpSetupAction,
} from '@/app/(app)/reglages/actions';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input } from '@/components/verre/ui/form';

export function SecuritySettings({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function enable(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await enableTotpAction(String(formData.get('password') ?? ''));
      if ('error' in result) setError(result.error);
      else setSetup(result);
    });
  }
  function verify(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await verifyTotpSetupAction(
        String(formData.get('code') ?? '').replace(/\s/g, ''),
      );
      if (result.ok) {
        setSetup(null);
        setMessage('L’authentification à deux facteurs est activée.');
      } else setError(result.error ?? 'Code incorrect.');
    });
  }
  function disable(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await disableTotpAction(String(formData.get('password') ?? ''));
      if (result.ok) setMessage('L’authentification à deux facteurs est désactivée.');
      else setError(result.error ?? 'Impossible de désactiver.');
    });
  }

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-h2 font-semibold text-fg">Authentification à deux facteurs</h2>
        <p className="mt-1 text-ui text-muted">
          Protégez votre compte avec une application d’authentification.
        </p>
      </div>
      {message && (
        <Notice tone="success" live="status">
          {message}
        </Notice>
      )}
      {error && (
        <Notice tone="error" live="alert">
          {error}
        </Notice>
      )}
      {setup ? (
        <div className="grid gap-4 rounded-panel border border-line p-5">
          <p className="text-ui text-fg-2">
            Scannez ce code QR avec une application d’authentification, puis confirmez avec le code
            affiché.
          </p>
          <div className="w-fit rounded-panel bg-white p-3">
            <QRCodeSVG value={setup.uri} size={192} />
          </div>
          <details>
            <summary className="cursor-pointer text-label text-accent">
              Afficher la clé de configuration
            </summary>
            <code className="mt-2 block break-all text-label">
              {new URL(setup.uri).searchParams.get('secret')}
            </code>
          </details>
          <div>
            <h3 className="text-label font-semibold text-fg">Codes de secours</h3>
            <p className="mt-1 text-label text-muted">
              Enregistrez-les maintenant. Chaque code ne peut servir qu’une fois.
            </p>
            <pre className="mt-2 grid grid-cols-2 gap-2 rounded-panel bg-surface p-3 text-label">
              {setup.backupCodes.join('\n')}
            </pre>
          </div>
          <form action={verify} className="flex flex-wrap items-end gap-3">
            <Field label="Code à 6 chiffres">
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </Field>
            <Button type="submit" variant="primary" loading={pending}>
              Activer
            </Button>
          </form>
        </div>
      ) : enabled ? (
        <form action={disable} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-ui text-fg-2">La protection par application est activée.</p>
          <Field label="Mot de passe">
            <Input name="password" type="password" autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="secondary" loading={pending}>
            Désactiver
          </Button>
        </form>
      ) : (
        <form action={enable} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-ui text-fg-2">
            Aucune application d’authentification n’est encore configurée.
          </p>
          <Field label="Mot de passe">
            <Input name="password" type="password" autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="primary" loading={pending}>
            Configurer la double authentification
          </Button>
        </form>
      )}
    </section>
  );
}

export function ProfileSettings({ name, email }: { name: string; email: string }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(data) => {
        setError('');
        setStatus('');
        startTransition(async () => {
          const result = await updateProfileAction(String(data.get('name') ?? ''));
          if (result.ok) setStatus('Votre profil a été mis à jour.');
          else setError(result.error ?? 'Impossible de mettre à jour le profil.');
        });
      }}
      className="grid max-w-md gap-4"
    >
      <Field label="Nom">
        <Input name="name" defaultValue={name} autoComplete="name" />
      </Field>
      <Field label="Adresse e-mail" help="Pour modifier votre adresse, contactez l’administrateur.">
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
        Enregistrer
      </Button>
    </form>
  );
}
