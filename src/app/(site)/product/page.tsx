import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProduitPage } from '@/components/site/pages/produit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return { title: t('productTitle'), description: t('productDescription') };
}

export default function Page() {
  return <ProduitPage />;
}
