import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorTurn } from '@/server/connectors/types';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { readFiche } from './fiche';
import { processFicheJob } from './worker';

vi.mock('@/server/pipeline/queue');

// Le travail de la file `fiche-construire`, de bout en bout sous les droits de la personne : ses lignes calculées,
// puis son rôle et ses tâches par le faux modèle. Les mails passent par la normalisation et l'ingestion des
// connecteurs, comme une relève. La file elle-même se teste dans queue.db.test.ts. Données inventées : Julie, des
// adresses en .test qui n'existent pas.

const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const ROLE = 'Commerciale : suit les clients et prépare les devis.';
// Les trois fils de Julie sont les sources 1 à 3 de la consigne.
const ANSWER = [
  `${JSON.stringify({ role: ROLE })}\n`,
  `${JSON.stringify({ tache: 'Envoyer les devis', detail: 'Un client demande un prix.', n: [1, 2, 3] })}\n`,
];

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});
afterEach(() => vi.restoreAllMocks());

const mail = (at: Date, text: string): ConnectorTurn => ({
  externalId: `message:${randomUUID()}`,
  role: 'participant',
  author: { name: 'Julie Martin', email: 'julie@acme.test' },
  side: 'team',
  recipients: { to: ['lea@client.test'], cc: [] },
  text,
  ts: at.toISOString(),
});

// Julie, et trois fils de courrier où elle a écrit, relevés par sa boîte privée.
async function julieWithMails(): Promise<TenantContext> {
  const { tenantId, members } = await createTestTenant(['Julie Martin']);
  tenantIds.push(tenantId);
  const [julie] = members as [TenantContext];
  const connection = {
    id: await seedConnection(julie, { provider: 'gmail' }),
    provider: 'gmail' as const,
    createdBy: julie.userId,
    privateRaw: true,
  };
  for (const days of [1, 2, 3]) {
    const item = normalizeItem(
      {
        externalId: `thread:${randomUUID()}`,
        nature: 'fil',
        title: `Devis ${days}`,
        url: null,
        updatedAt: ago(days * DAY).toISOString(),
        origin: {},
        turns: [mail(ago(days * DAY), 'Bonjour Léa,\nVoici votre devis.\nCordialement')],
      },
      'gmail',
    );
    if (!item) throw new Error('fil de test refusé par la normalisation');
    await ingestConnectorItems(julie, connection, [item]);
  }
  return julie;
}

const jobOf = (ctx: TenantContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });
const provenances = async (ctx: TenantContext) =>
  Object.fromEntries((await readFiche(ctx)).map((line) => [line.genre, line.provenance]));

describe('processFicheJob (file fiche-construire)', () => {
  it('construit les lignes calculées, puis le modèle écrit le rôle et les tâches, en un seul appel', async () => {
    const julie = await julieWithMails();
    const llm = createFakeLlm({ texts: ANSWER });
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await processFicheJob(jobOf(julie), { llm });

    expect(llm.calls.map((call) => call.step)).toEqual(['fiche']);
    expect(await provenances(julie)).toMatchObject({
      interlocuteur: 'calcul',
      appels: 'calcul',
      role: 'synthese',
      tache: 'synthese',
    });
  });

  it('sans modèle, écrit quand même les lignes calculées, sans rôle ni tâche', async () => {
    const julie = await julieWithMails();

    await processFicheJob(jobOf(julie), { llm: null });

    const fiche = await provenances(julie);
    expect(fiche).toMatchObject({ interlocuteur: 'calcul', appels: 'calcul' });
    expect(fiche).not.toHaveProperty('role');
    expect(fiche).not.toHaveProperty('tache');
  });

  it('une panne du modèle laisse les lignes calculées et relance le travail ; sa reprise écrit le rôle', async () => {
    const julie = await julieWithMails();
    const failing: Llm = {
      // biome-ignore lint/correctness/useYield: un modèle en panne ne rend rien
      async *streamText() {
        throw new LlmError('erreur du modèle');
      },
      runAgent: () => {
        throw new Error('hors du test');
      },
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    // pg-boss reprend ce qui lève : le résumé de l'erreur, jamais son message de base.
    await expect(processFicheJob(jobOf(julie), { llm: failing })).rejects.toThrow(
      /LlmError.*erreur du modèle/,
    );

    expect(log.mock.calls.flat().map(String).join('\n')).toContain('fiche.build_failed');
    const before = await provenances(julie);
    expect(before).toMatchObject({ interlocuteur: 'calcul' });
    expect(before).not.toHaveProperty('role');

    await processFicheJob(jobOf(julie), { llm: createFakeLlm({ texts: ANSWER }) });

    expect(await provenances(julie)).toMatchObject({ interlocuteur: 'calcul', role: 'synthese' });
  });

  it('saute sans erreur une personne partie de l’organisation, et refuse un travail sans ses deux identifiants', async () => {
    const julie = await julieWithMails();
    const llm = createFakeLlm({ texts: ANSWER });

    await expect(
      processFicheJob({ tenantId: julie.tenantId, userId: randomUUID() }, { llm }),
    ).resolves.toBeUndefined();
    await expect(processFicheJob({ ...jobOf(julie), userId: 'x' }, { llm })).rejects.toThrow();

    expect(llm.calls).toEqual([]);
    expect(await readFiche(julie)).toEqual([]);
  });
});
