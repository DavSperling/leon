'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { updateAboutAction } from '@/app/(app)/reglages/actions';
import { Button, Field, Notice, Section, Textarea } from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import { SECTION } from './reglages';

/** « À propos de vous » : ce que le point du matin sait de la personne. `max` vient du serveur (about.ts). */
export function AboutSettings({ about, max }: { about: string; max: number }) {
  const t = useTranslations('about');
  const [value, setValue] = useState(about);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <Section title={t('title')} description={nb(t('description'))} className={SECTION}>
      <form
        action={() => {
          setError('');
          setStatus('');
          startTransition(async () => {
            const result = await updateAboutAction(value);
            if ('error' in result) setError(result.error);
            else setStatus(t('saved'));
          });
        }}
        className="grid max-w-md gap-4"
      >
        <Field
          label={t('label')}
          aside={
            <span className="text-muted tabular-nums">
              {value.length} / {max}
            </span>
          }
        >
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={max}
            rows={4}
            autoGrow
            placeholder={nb(t('placeholder'))}
          />
        </Field>
        {status && (
          <Notice tone="success" live="status">
            {nb(status)}
          </Notice>
        )}
        {error && (
          <Notice tone="error" live="alert">
            {nb(error)}
          </Notice>
        )}
        <Button type="submit" variant="primary" loading={pending} className="w-fit">
          {t('save')}
        </Button>
      </form>
    </Section>
  );
}
