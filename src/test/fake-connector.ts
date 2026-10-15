import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import type { AnyConnector, ConnectorItem, SyncPage } from '@/server/connectors/types';

// Un connecteur factice (outil GitHub) : `items` éléments numérotés de 1 à `items`, `pageSize` par
// page. Le curseur est le rang du dernier élément rendu : la reprise commence juste après.
// `failAt.page` compte les pages du passage en cours, à partir de 1 ; l'erreur est levée avant de
// rendre cette page (401 → ConnectorAuthError, 500 → ConnectorHttpError).
export function fakeConnector(input: {
  items: number;
  pageSize: number;
  failAt?: { page: number; status: 401 | 500 };
}): AnyConnector {
  const { items, pageSize, failAt } = input;
  const day = 24 * 3_600_000;

  const itemAt = (rank: number): ConnectorItem => {
    const updatedAt = new Date(Date.UTC(2026, 0, 1) + rank * day).toISOString();
    return {
      externalId: `fake:${rank}`,
      nature: 'ticket',
      title: `Élément ${rank}`,
      url: `https://github.test/acme/leon/issues/${rank}`,
      updatedAt,
      origin: { repo: 'acme/leon' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: `Texte de l'élément ${rank}.`,
          ts: updatedAt,
        },
      ],
    };
  };

  return {
    id: 'github',
    configSchema: z.object({ token: z.string().min(1) }),
    secretFields: ['token'],
    hosts: () => ['api.github.test'],
    verify: async () => ({ account: 'fictif' }),
    async *sync(_config, state): AsyncGenerator<SyncPage> {
      let last = state.cursor === null ? 0 : Number(state.cursor);
      for (let page = 1; last < items; page += 1) {
        if (failAt?.page === page) {
          if (failAt.status === 401) throw new ConnectorAuthError('GitHub', 401);
          throw new ConnectorHttpError(500, 'GitHub a répondu 500');
        }
        const end = Math.min(last + pageSize, items);
        const ranks = Array.from({ length: end - last }, (_, index) => last + 1 + index);
        last = end;
        yield { items: ranks.map(itemAt), cursor: String(last) };
      }
    },
  };
}
