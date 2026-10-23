import type { Metadata } from 'next';
import { ProduitPage } from '@/components/site/pages/produit';

export const metadata: Metadata = {
  title: 'Comment ça marche',
  description:
    'Leon se branche sur vos outils et vos assistants d’IA, garde chaque élément tel quel, et répond en citant ses sources.',
};

export default function Page() {
  return <ProduitPage />;
}
