import type { Metadata } from 'next';
import { HomeSignal } from '@/components/site/home/signal';

export const metadata: Metadata = {
  // servie aussi sur « / » (src/proxy.ts) : « / » est l'adresse de référence
  alternates: { canonical: '/' },
  title: { absolute: 'Leon · La mémoire de votre entreprise, avec ses sources' },
  description:
    'Leon garde ce qui se dit dans vos outils et vos conversations d’IA, tel quel, et le retrouve avec sa source. Quand rien ne répond, il le dit.',
};

export default function AccueilPage() {
  return <HomeSignal />;
}
