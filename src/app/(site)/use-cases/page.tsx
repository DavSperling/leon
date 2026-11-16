import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CasUsagePage } from '@/components/site/pages/cas-usage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return { title: t('useCasesTitle'), description: t('useCasesDescription') };
}

export default function Page() {
  return <CasUsagePage />;
}
