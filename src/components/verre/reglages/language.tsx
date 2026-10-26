'use client';

import { useLocale, useTranslations } from 'next-intl';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { Button, Section } from '@/components/verre';
import { SECTION } from './reglages';

export function LanguageSettings() {
  const locale = useLocale();
  const t = useTranslations('language');
  return (
    <Section title={t('title')} description={t('description')} className={SECTION}>
      <form action={setLocaleAction} className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-48 gap-2 text-label font-medium text-fg-2">
          {t('label')}
          <select
            name="locale"
            defaultValue={locale}
            className="h-10 rounded-field border border-line bg-glass-2 px-3 text-ui text-fg outline-none focus-visible:border-accent-line"
          >
            <option value="fr">{t('french')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          {t('save')}
        </Button>
      </form>
    </Section>
  );
}
