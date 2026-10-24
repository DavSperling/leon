import type { Metadata } from 'next';
import { SecuritePage } from '@/components/site/pages/securite';

export const metadata: Metadata = {
  title: 'Sécurité',
  description:
    'Leon voit ce que vous voyez : isolation par entreprise, droits appliqués avant le classement, conversations privées, clés chiffrées. Et ce qui n’est pas encore là.',
};

export default function Page() {
  return <SecuritePage />;
}
