import type { Metadata } from 'next';
import { TOOL_COUNT } from '@/components/site/content';
import { ConnecteursPage } from '@/components/site/pages/connecteurs';

export const metadata: Metadata = {
  title: 'Connecteurs',
  description: `Les ${TOOL_COUNT} outils que Leon relève toutes les 15 minutes (dev, réunions, projet, CRM, support, mails), et les conversations avec vos assistants d’IA.`,
};

export default function Page() {
  return <ConnecteursPage />;
}
