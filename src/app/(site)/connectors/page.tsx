import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TOOL_COUNT } from '@/components/site/content';
import { ConnecteursPage } from '@/components/site/pages/connecteurs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return {
    title: t('connectorsTitle'),
    description: t('connectorsDescription', { count: TOOL_COUNT }),
  };
}

export default function Page() {
  return <ConnecteursPage />;
}
