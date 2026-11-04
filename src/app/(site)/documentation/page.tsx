import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DocumentationPage } from '@/components/site/pages/documentation';
import {
  claudeCodeInstructions,
  installCommand,
  serverAddress,
} from '@/server/cli/install-command';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return { title: t('documentationTitle'), description: t('documentationDescription') };
}

// La commande, la consigne de « Je demande à Claude » et l'adresse qu'elles portent sont bâties ici, côté serveur, sur
// BETTER_AUTH_URL ; null quand le script d'installation refuse cette adresse (la page montre alors la forme générique).
export default async function Page() {
  return (
    <DocumentationPage
      command={installCommand()}
      address={serverAddress()}
      instructions={claudeCodeInstructions(await getTranslations('claudeCode'))}
    />
  );
}
