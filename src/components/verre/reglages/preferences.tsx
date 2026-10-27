'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { Field, Section, Select } from '@/components/verre';
import { useTheme } from '@/lib/verre';
import { SECTION } from './reglages';

// Pas de bouton : la langue et le thème s'appliquent dès qu'on les choisit.
// setLocaleAction lit un formulaire : le pied du site public s'en sert sans JavaScript.
const localeForm = (locale: string) => {
  const data = new FormData();
  data.set('locale', locale);
  return data;
};

export function PreferencesSettings() {
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  const t = useTranslations('preferences');
  return (
    <Section title={t('title')} description={t('description')} className={SECTION}>
      <div className="flex flex-wrap gap-4">
        <Field label={t('language')}>
          <Select
            className="min-w-48"
            defaultValue={locale}
            onValueChange={(value) => startTransition(() => setLocaleAction(localeForm(value)))}
            options={[
              { value: 'fr', label: t('french') },
              { value: 'en', label: t('english') },
            ]}
          />
        </Field>
        <Field label={t('theme')}>
          <Select
            className="min-w-48"
            value={theme}
            onValueChange={(value) => setTheme(value === 'light' ? 'light' : 'dark')}
            options={[
              { value: 'dark', label: t('dark') },
              { value: 'light', label: t('light') },
            ]}
          />
        </Field>
      </div>
    </Section>
  );
}
