import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TarifsPage } from '@/components/site/pages/tarifs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return { title: t('pricingTitle'), description: t('pricingDescription') };
}

export default function Page() {
  return <TarifsPage />;
}
