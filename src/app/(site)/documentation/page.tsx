import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { DocumentationPage } from '@/components/site/pages/documentation';
import { documentationMarkdown } from '@/components/site/pages/documentation-markdown';
import { localeOf } from '@/i18n/request';
import {
  claudeCodeInstructions,
  installCommand,
  serverAddress,
} from '@/server/cli/install-command';

// Un agent qui lit la page trouve ainsi le Markdown : <link rel="alternate" type="text/markdown" href="/documentation.md">.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.meta');
  return {
    title: t('documentationTitle'),
    description: t('documentationDescription'),
    alternates: { types: { 'text/markdown': '/documentation.md' } },
  };
}

// La commande, la consigne de « Je demande à Claude » et l'adresse qu'elles portent sont bâties ici, côté serveur, sur
// BETTER_AUTH_URL ; null quand le script d'installation refuse cette adresse (la page montre alors la forme générique).
// ?vue=agent ouvre le mode « Pour un agent » : la page montre alors le même Markdown que /documentation.md.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = (await searchParams).vue === 'agent' ? 'agent' : 'human';
  const command = installCommand();
  const address = serverAddress();
  const instructions = claudeCodeInstructions(await getTranslations('claudeCode'));
  const markdown =
    view === 'agent'
      ? documentationMarkdown({
          locale: localeOf(await getLocale()),
          messages: await getMessages(),
          command,
          address,
          instructions,
        })
      : '';
  return (
    <DocumentationPage
      command={command}
      address={address}
      instructions={instructions}
      view={view}
      markdown={markdown}
    />
  );
}
