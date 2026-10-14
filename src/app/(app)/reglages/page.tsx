import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { API_PATHS } from '@/capture/api-contract';
import { CopyButton } from '@/components/copy-button';
import { CreateTokenDialog } from '@/components/create-token-dialog';
import { TokenList } from '@/components/token-list';
import { listApiTokens } from '@/server/auth/api-tokens';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Réglages' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section aria-labelledby={id} className="mt-12 space-y-4">
      <h2 id={id} className="text-2xl leading-8 font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CodeLine({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/60 p-2 pl-4">
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
    <div className="mx-auto w-full max-w-[780px] px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Réglages</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Jetons d'accès et branchement des assistants
        </p>
      </header>

      <Section title="Jetons personnels">
        <div className="flex items-center justify-between gap-4">
          <p className="text-base leading-7 text-foreground-2">
            Un jeton donne accès à ce que vous voyez. Il n'est montré qu'une fois.
          </p>
          <CreateTokenDialog />
        </div>
        {tokens.length === 0 ? (
          <p className="text-base leading-7 text-muted-foreground">Aucun jeton pour l'instant.</p>
        ) : (
          <TokenList tokens={tokens} />
        )}
      </Section>

      <Section title="Brancher Claude Code">
        <p className="text-base leading-7 text-foreground-2">
          Lancez cette commande dans un terminal, en remplaçant le jeton par l'un des vôtres.
        </p>
        <CodeLine
          text={`claude mcp add --transport http leon ${mcpUrl} --header "Authorization: Bearer <votre jeton>"`}
        />
      </Section>

      <Section title="Extension navigateur">
        <ol className="list-decimal space-y-2 pl-5 text-base leading-7 text-foreground-2 marker:text-muted-foreground">
          <li>
            Construisez l'extension avec{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
              pnpm ext:build
            </code>
            .
          </li>
          <li>
            Dans Chrome, ouvrez{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
              chrome://extensions
            </code>
            , activez le mode développeur, puis « Charger l'extension non empaquetée » et choisissez
            le dossier{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
              extension/.output/chrome-mv3
            </code>
            .
          </li>
          <li>Dans les options de l'extension, collez un jeton créé ci-dessus.</li>
        </ol>
        <p className="text-base leading-7 text-foreground-2">
          Adresse du serveur, fixée à la construction de l'extension (variable{' '}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
            WXT_PUBLIC_LEON_URL
          </code>
          ) :
        </p>
        <CodeLine text={serverUrl} />
      </Section>
    </div>
  );
}
