import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SecuritePage } from '@/components/site/pages/securite';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return { title: t('securityTitle'), description: t('securityDescription') };
}

export default function Page() {
  return <SecuritePage />;
}
