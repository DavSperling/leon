import type { Metadata } from 'next';
import { API_PATHS } from '@/capture/api-contract';
import { CodeLine, CopyButton, PageHeader, Section } from '@/components/verre';
import { CommandBlock, INLINE, SECTION, Step } from '@/components/verre/reglages/reglages';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { nb } from '@/lib/verre/nb';
import { listApiTokens } from '@/server/auth/api-tokens';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Réglages' };

export default async function SettingsPage() {
  const ctx = await requireUserContext();
  const tokens = (await listApiTokens(ctx))
    .filter((token) => !token.revokedAt)
    .map(({ revokedAt: _, ...token }) => token);
  const serverUrl = env.BETTER_AUTH_URL;
  const mcpUrl = new URL(API_PATHS.mcp, serverUrl).toString();
  // La demande à coller dans Claude Code : il construit l'extension et la charge dans Chrome ; le jeton reste à
  // l'utilisateur, qui le colle lui-même.
  const extensionPrompt = `Installe l'extension navigateur de Leon depuis ce dépôt :
1. Construis-la avec WXT_PUBLIC_LEON_URL=${serverUrl} pnpm ext:build.
2. Dans Chrome, ouvre chrome://extensions, active le mode développeur, clique sur « Charger l'extension non empaquetée » et choisis le dossier extension/.output/chrome-mv3.
3. Ouvre ensuite les options de l'extension et laisse-moi y coller mon jeton Leon moi-même.`;
  const command = `claude mcp add --transport http leon ${mcpUrl} --header "Authorization: Bearer <votre jeton>"`;

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="Réglages"
        subtitle="Jetons d’accès et branchement des assistants"
        className="mb-10"
      />

      <TokensSection tokens={tokens} />

      <Section
        id="claude-code"
        title="Brancher Claude Code"
        description="Lancez cette commande dans un terminal, en remplaçant le jeton par l’un des vôtres."
        className={SECTION}
      >
        <CommandBlock command={command} />
      </Section>

      <Section
        id="extension"
        title="Extension navigateur"
        description="Copiez la demande et collez-la dans Claude Code, ouvert dans le dépôt Leon : il construit et charge l’extension pour vous. Ou suivez les étapes à la main."
        actions={<CopyButton value={extensionPrompt} label="Demander à Claude de le faire" />}
        className={SECTION}
      >
        <ol className="grid gap-3.5">
          <Step n={1}>
            Construisez l’extension avec <code className={INLINE}>pnpm ext:build</code>.
          </Step>
          <Step n={2}>
            Dans Chrome, ouvrez <code className={INLINE}>chrome://extensions</code>, activez le mode
            développeur, puis {nb('« Charger l’extension non empaquetée »')} et choisissez le
            dossier <code className={INLINE}>extension/.output/chrome-mv3</code>.
          </Step>
          <Step n={3}>
            Dans les options de l’extension, collez{' '}
            <a
              href="#jetons"
              className="text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              un jeton créé ci-dessus
            </a>
            .
          </Step>
        </ol>
        <p className="mt-6 mb-2.5 text-body text-fg-2">
          Adresse du serveur, fixée à la construction de l’extension (variable{' '}
          <code className={INLINE}>WXT_PUBLIC_LEON_URL</code>){nb(' :')}
        </p>
        <CodeLine code={serverUrl} />
      </Section>
    </div>
  );
}
