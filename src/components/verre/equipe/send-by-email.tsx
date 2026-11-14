'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { type SendInvitationError, sendInvitationEmailAction } from '@/app/(app)/equipe/actions';
import { Button } from '@/components/verre/ui/button';
import { Input } from '@/components/verre/ui/form';
import { DoneMark } from '@/components/verre/ui/marks';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';

/**
 * « Envoyer par e-mail » un lien d'invitation : une adresse, « Envoyer », puis « Envoyé à … ». Un refus se dit sous le
 * champ. Sert au panneau d'invitation de l'Équipe et à l'étape Collaborateurs de l'onboarding (plusieurs par page).
 */
export function SendByEmail({ url, className }: { url: string; className?: string }) {
  const t = useTranslations('team');
  const id = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<SendInvitationError | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await sendInvitationEmailAction(url, email);
        if ('error' in result) setError(result.error);
        else setSent(email.trim());
      } catch {
        setError('failed');
      }
    });
  };
  if (sent)
    return (
      <p role="status" className={cn('text-ui text-fg', className)}>
        <DoneMark>{t('sentTo', { email: sent })}</DoneMark>
      </p>
    );
  return (
    <form noValidate onSubmit={send} className={cn('grid gap-1.5', className)}>
      <label htmlFor={`${id}-e`} className="text-label font-medium text-fg">
        {t('sendByEmail')}
      </label>
      <div className="flex gap-2">
        <Input
          id={`${id}-e`}
          type="email"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? `${id}-x` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="h-10 min-w-0 flex-1 px-3"
        />
        <Button
          type="submit"
          className="h-10"
          loading={pending}
          loadingLabel={t('sending')}
          disabled={!email.trim()}
        >
          {t('send')}
        </Button>
      </div>
      {error && (
        <p id={`${id}-x`} role="alert" className="text-label font-medium text-destructive">
          {nb(t(`sendErrors.${error}`))}
        </p>
      )}
    </form>
  );
}
