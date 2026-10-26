import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/verre/ui/button';
import { serializeOAuthQuery } from '@/lib/oauth-query';
import { auth } from '@/server/auth/auth';
import { getUserContext } from '@/server/auth/session';
import { decideMcpAuthorization } from './actions';

export const metadata: Metadata = { title: 'Autoriser une connexion MCP' };

export default async function McpAuthorizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = serializeOAuthQuery(params);
  if (!(await getUserContext())) {
    redirect(query ? `/connexion?${new URLSearchParams({ oauth_query: query })}` : '/connexion');
  }

  if (!query || query.length > 8000) redirect('/connexion');
  const oauthQuery = new URLSearchParams(query);
  const clientId = oauthQuery.get('client_id');
  let clientName = 'cet assistant';
  if (clientId) {
    try {
      const client = await auth.api.getOAuthClientPublic({
        headers: await headers(),
        query: { client_id: clientId },
      });
      clientName = client.client_name || clientName;
    } catch {
      // Un client CIMD peut ne pas encore être connu localement : la connexion reste identifiable par le type d'accès demandé.
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-label font-medium text-accent">Connexion MCP</p>
        <h1 className="mt-1 text-h2 font-semibold tracking-[-0.018em] text-fg">
          Autoriser {clientName} ?
        </h1>
        <p className="mt-3 text-body leading-relaxed text-muted">
          Cet assistant pourra chercher et lire les données visibles dans votre espace Leon,
          consulter les briefings et enregistrer les notes que vous lui demandez.
        </p>
      </div>
      <form action={decideMcpAuthorization} className="grid gap-3">
        <input type="hidden" name="oauth_query" value={query} />
        <Button type="submit" name="accept" value="oui" variant="primary" className="w-full">
          Autoriser l’accès
        </Button>
        <Button type="submit" name="accept" value="non" variant="secondary" className="w-full">
          Refuser
        </Button>
      </form>
    </div>
  );
}
