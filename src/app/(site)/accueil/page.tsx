import type { Metadata } from 'next';
import { HomeSignal } from '@/components/site/home/signal';

export const metadata: Metadata = {
  title: { absolute: 'Leon · La mémoire de votre entreprise, avec ses sources' },
  description:
    'Leon garde ce qui se dit dans vos outils et vos conversations d’IA, tel quel et avec ses droits, et le retrouve avec sa source.',
};

export default function AccueilPage() {
  return <HomeSignal />;
}
