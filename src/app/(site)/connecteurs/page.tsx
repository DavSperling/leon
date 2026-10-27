import type { Metadata } from 'next';
import { SYNC_DELAY, TOOL_COUNT } from '@/components/site/content';
import { ConnecteursPage } from '@/components/site/pages/connecteurs';

export const metadata: Metadata = {
  title: 'Connecteurs',
  description: `Les ${TOOL_COUNT} outils de dev, réunions, projet, CRM, support et mail que Leon relève ${SYNC_DELAY}, et les conversations avec vos assistants d’IA.`,
};

export default function Page() {
  return <ConnecteursPage />;
}
