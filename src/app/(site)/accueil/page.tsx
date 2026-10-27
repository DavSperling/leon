import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HomeSignal } from '@/components/site/home/signal';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return {
    // servie aussi sur « / » (src/proxy.ts) : « / » est l'adresse de référence
    alternates: { canonical: '/' },
    title: { absolute: t('homeTitle') },
    description: t('homeDescription'),
  };
}

export default function AccueilPage() {
  return <HomeSignal />;
}
