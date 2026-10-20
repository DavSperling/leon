import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { API_PATHS } from '@/capture/api-contract';
import { CopyButton } from '@/components/copy-button';
import { CreateTokenDialog } from '@/components/create-token-dialog';
import { PAGE, PageHeader } from '@/components/page-header';
import { TokenList } from '@/components/token-list';
import { listApiTokens } from '@/server/auth/api-tokens';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Réglages' };

// Une rangée de réglages : le titre et ce qu'il fait à gauche, le panneau à droite.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = `section-${title.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-[320px_minmax(0,1fr)] gap-10 border-t py-8 first-of-type:border-t-0"
    >
      <div className="pt-1">
        <h2 id={id} className="text-[16px] leading-6 font-medium">
          {title}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 space-y-4 rounded-lg bg-muted p-5">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return <code className="font-mono text-[13px]">{children}</code>;
}

function CodeLine({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-card p-2 pl-4">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-[13px] leading-5 break-all">
        {text}
      </code>
      <CopyButton text={text} />
    </div>
  );
}

export default async function SettingsPage() {
  const ctx = await requireUserContext();
  const tokens = (await listApiTokens(ctx)).filter((token) => !token.revokedAt);
  const serverUrl = env.BETTER_AUTH_URL;
  const mcpUrl = new URL(API_PATHS.mcp, serverUrl).toString();

  return (
    <div className={PAGE}>
      <PageHeader title="Réglages" description="Jetons d’accès et branchement des assistants." />

      <div className="mt-6">
        <Section
          title="Jetons personnels"
          description="Un jeton donne accès à ce que vous voyez. Il n’est montré qu’une fois."
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-[14px] leading-5 text-foreground-2 tabular-nums">
              {tokens.length === 0
                ? 'Aucun jeton pour l’instant.'
                : `${tokens.length} ${tokens.length > 1 ? 'jetons actifs' : 'jeton actif'}`}
            </p>
            <CreateTokenDialog />
          </div>
          {tokens.length > 0 && <TokenList tokens={tokens} />}
        </Section>

        <Section
          title="Brancher Claude Code"
          description="Leon devient un outil MCP de Claude Code : il y cherche et y cite vos sources."
        >
          <p className="text-[14px] leading-5 text-foreground-2">
            Lancez cette commande dans un terminal, en remplaçant le jeton par l’un des vôtres.
          </p>
          <CodeLine
            text={`claude mcp add --transport http leon ${mcpUrl} --header "Authorization: Bearer <votre jeton>"`}
          />
        </Section>

        <Section
          title="Extension navigateur"
          description="Elle capte vos conversations sur claude.ai et ChatGPT. Elles restent privées."
        >
          <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-6 text-foreground-2 marker:text-muted-foreground">
            <li>
              Construisez l’extension avec <Code>pnpm ext:build</Code>.
            </li>
            <li>
              Dans Chrome, ouvrez <Code>chrome://extensions</Code>, activez le mode développeur,
              puis « Charger l’extension non empaquetée » et choisissez le dossier{' '}
              <Code>extension/.output/chrome-mv3</Code>.
            </li>
            <li>Dans les options de l’extension, collez un jeton créé ci-dessus.</li>
          </ol>
          <p className="text-[14px] leading-5 text-foreground-2">
            Adresse du serveur, fixée à la construction de l’extension (variable{' '}
            <Code>WXT_PUBLIC_LEON_URL</Code>) :
          </p>
          <CodeLine text={serverUrl} />
        </Section>
      </div>
    </div>
  );
}
