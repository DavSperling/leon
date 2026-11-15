import type { Metadata } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { StandaloneMessage } from '@/components/verre/auth/standalone-card';
import { ThemeToggle } from '@/components/verre/auth/theme-toggle';
import { StandaloneShell } from '@/components/verre/shell';
import { Button } from '@/components/verre/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('errors'))('notFoundTitle') };
}

export default async function NotFound() {
  const t = await getTranslations('errors');
  // Son propre fournisseur : sur un POST qui n'est pas une vraie server action, Next rend cette page sans le layout racine.
  return (
    <NextIntlClientProvider>
      <StandaloneShell>
        <StandaloneMessage
          title={t('notFound')}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{t('backHome')}</Link>
            </Button>
          }
        />
        <ThemeToggle />
      </StandaloneShell>
    </NextIntlClientProvider>
  );
}
