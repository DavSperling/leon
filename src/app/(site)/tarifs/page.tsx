import type { Metadata } from 'next';
import { TarifsPage } from '@/components/site/pages/tarifs';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Un pilote gratuit de 30 jours, puis un prix par utilisateur actif et par mois, sans engagement.',
};

export default function Page() {
  return <TarifsPage />;
}
