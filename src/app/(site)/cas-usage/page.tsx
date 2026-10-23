import type { Metadata } from 'next';
import { CasUsagePage } from '@/components/site/pages/cas-usage';

export const metadata: Metadata = {
  title: 'Cas d’usage',
  description:
    'Direction, ventes, support, produit, chefs de projet, nouvelles arrivées : les questions que chaque équipe pose à Leon, et ce qu’il répond, avec ses sources.',
};

export default function Page() {
  return <CasUsagePage />;
}
