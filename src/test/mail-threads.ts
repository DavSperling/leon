import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorTurn } from '@/server/connectors/types';
import { adminPool } from './db';
import { seedConnection } from './fixtures';

// Des fils de courrier pour les tests sur base : ils passent par la normalisation et l'ingestion des connecteurs,
// comme une relève, et leurs identifiants de tours sont ceux de la production. Le fichier de test simule la file de
// l'indexation (vi.mock('@/server/pipeline/queue')). Données inventées : Julie Martin reçoit de Léa Roy, des adresses
// en .test qui n'existent pas.

export const JULIE = 'julie@acme.test';
export const LEA = 'lea@client.test';

// Un mail reçu par Julie, de Léa.
export const received = (
  at: Date,
  text: string,
  over: Partial<ConnectorTurn> = {},
): ConnectorTurn => ({
  externalId: `message:${randomUUID()}`,
  role: 'participant',
  author: { name: 'Léa Roy', email: LEA },
  recipients: { to: [JULIE], cc: [] },
  text,
  ts: at.toISOString(),
  ...over,
});

// Un mail envoyé par Julie, à Léa.
export const sent = (
  at: Date,
  text: string,
  to: string[] = [LEA],
  cc: string[] = [],
): ConnectorTurn =>
  received(at, text, {
    author: { name: 'Julie Martin', email: JULIE },
    side: 'team',
    recipients: { to, cc },
  });

// Un fil relevé par la boîte de `owner`, privée sauf `shared` (une boîte partagée à l'équipe). Rend sa source.
export async function mailThread(
  owner: TenantContext,
  title: string,
  messages: ConnectorTurn[],
  options: { provider?: 'gmail' | 'outlook' | 'crisp'; shared?: boolean; url?: string } = {},
): Promise<string> {
  const provider = options.provider ?? 'gmail';
  const externalId = `thread:${randomUUID()}`;
  const item = normalizeItem(
    {
      externalId,
      nature: 'fil',
      title,
      url: options.url ?? null,
      updatedAt: messages.at(-1)?.ts ?? '',
      origin: {},
      turns: messages,
    },
    provider,
  );
  if (!item) throw new Error('fil de test refusé par la normalisation');
  const connection = {
    id: await seedConnection(owner, { provider }),
    provider,
    createdBy: owner.userId,
    privateRaw: !options.shared,
  };
  await ingestConnectorItems(owner, connection, [item]);
  const { rows } = await adminPool.query<{ id: string }>(
    'select id from sources where tenant_id = $1 and external_id = $2',
    [owner.tenantId, externalId],
  );
  if (!rows[0]) throw new Error('fil de test non créé');
  return rows[0].id;
}
