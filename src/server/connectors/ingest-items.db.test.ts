import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { type ConnectionRef, ingestConnectorItems } from './ingest-items';
import { type NormalizedItem, normalizeItem } from './normalize';
import type { ConnectorItem, ConnectorTurn } from './types';

vi.mock('@/server/pipeline/queue');

// Organisation Paul + Marie (Paul branche l'outil), une autre organisation (Zoé).
// La connexion est insérée par le propriétaire de la base, hors RLS, en attendant connections.ts (T05).

const tenantIds: string[] = [];
let tenantId: string;
let paul: TenantContext;
let marie: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Paul', 'Marie']);
  const other = await createTestTenant(['Zoé']);
  tenantId = team.tenantId;
  [paul, marie] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

// Les connexions sont partagées par tous les fichiers de test : on retire les nôtres, et seulement elles.
afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

async function seedConnection(ctx: TenantContext): Promise<ConnectionRef> {
  const id = randomUUID();
  await adminPool.query(
    `insert into connections (id, tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
     values ($1, $2, $3, 'github', 'Connexion de test', 'v1:aaaa:bbbb:cccc', 'abcd', now(), array[$2::uuid])`,
    [id, ctx.tenantId, ctx.userId],
  );
  return { id, provider: 'github', createdBy: ctx.userId };
}

const body = (text: string): ConnectorTurn => ({
  externalId: 'body',
  role: 'document',
  author: { name: 'Marie Durand', email: 'marie@acme.test' },
  text,
  ts: '2026-10-14T09:00:00Z',
});
const comment = (n: number, text: string): ConnectorTurn => ({
  externalId: `comment:${n}`,
  role: 'participant',
  author: { name: 'Paul Martin', email: 'paul@acme.test' },
  text,
  ts: `2026-10-14T1${n}:00:00Z`,
});

function connectorItem(
  externalId: string,
  turnList: ConnectorTurn[],
  title = 'Ticket',
): ConnectorItem {
  return {
    externalId,
    nature: 'ticket',
    title,
    url: `https://github.com/acme/leon/issues/${externalId}`,
    updatedAt: '2026-10-14T12:00:00Z',
    origin: { repo: 'acme/leon' },
    turns: turnList,
  };
}

function normalized(item: ConnectorItem): NormalizedItem {
  const result = normalizeItem(item, 'github');
  if (!result) throw new Error('élément refusé par la normalisation');
  return result;
}

const readSources = (ctx: TenantContext, id: string) =>
  withTenant(ctx, (tx) => tx.select().from(sources).where(eq(sources.id, id)));
const readTurns = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) => tx.select().from(turns).where(eq(turns.sourceId, sourceId)));
const readRuns = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) => tx.select().from(ingestRuns).where(eq(ingestRuns.sourceId, sourceId)));

async function sourceIdOf(ctx: TenantContext, externalId: string): Promise<string> {
  const [row] = await withTenant(ctx, (tx) =>
    tx.select({ id: sources.id }).from(sources).where(eq(sources.externalId, externalId)),
  );
  if (!row) throw new Error('source introuvable');
  return row.id;
}

describe('ingestConnectorItems', () => {
  it('crée la source, ses tours et un run pour un élément à deux tours', async () => {
    const connection = await seedConnection(paul);
    const externalId = `issue:${randomUUID()}`;
    const item = normalized(
      connectorItem(externalId, [body('Le site plante au chargement.'), comment(1, 'Je regarde.')]),
    );

    const result = await ingestConnectorItems(paul, connection, [item]);

    expect(result).toMatchObject({ sources: 1, turns: 2 });
    expect(result.runs).toHaveLength(1);
    const sourceId = await sourceIdOf(paul, externalId);
    const [source] = await readSources(paul, sourceId);
    expect(source).toMatchObject({
      kind: 'github',
      ownerUserId: paul.userId,
      acl: [tenantId],
      connectionId: connection.id,
      title: 'Ticket',
      metadata: {
        nature: 'ticket',
        url: `https://github.com/acme/leon/issues/${externalId}`,
        origin: { repo: 'acme/leon' },
        updatedAt: '2026-10-14T12:00:00.000Z',
      },
    });
    expect(source?.lastTurnAt?.toISOString()).toBe('2026-10-14T11:00:00.000Z');
    const stored = await readTurns(paul, sourceId);
    expect(stored).toHaveLength(2);
    expect(stored.every((t) => t.captureMode === 'connector')).toBe(true);
    expect(stored.every((t) => t.acl.length === 1 && t.acl[0] === tenantId)).toBe(true);
    expect(stored.map((t) => [t.role, t.authorName, t.authorEmail]).sort()).toEqual([
      ['document', 'Marie Durand', 'marie@acme.test'],
      ['participant', 'Paul Martin', 'paul@acme.test'],
    ]);
    const [run] = await readRuns(paul, sourceId);
    expect(run).toMatchObject({
      id: result.runs[0],
      status: 'queued',
      step: 'triage',
      acl: [tenantId],
    });
    expect([...(run?.turnIds ?? [])].sort()).toEqual(stored.map((t) => t.id).sort());
    expect(enqueuePipelineStep).toHaveBeenCalledExactlyOnceWith('triage', {
      ingestRunId: result.runs[0],
      tenantId,
      userId: paul.userId,
    });
  });

  it("montre la source, ses tours et son run à toute l'équipe, à personne d'autre", async () => {
    const connection = await seedConnection(paul);
    const externalId = `issue:${randomUUID()}`;
    await ingestConnectorItems(paul, connection, [
      normalized(connectorItem(externalId, [body('Texte partagé.')])),
    ]);
    const sourceId = await sourceIdOf(paul, externalId);

    expect(await readSources(marie, sourceId)).toHaveLength(1);
    expect(await readTurns(marie, sourceId)).toHaveLength(1);
    expect(await readRuns(marie, sourceId)).toHaveLength(1);
    expect(await readSources(zoe, sourceId)).toHaveLength(0);
    expect(await readTurns(zoe, sourceId)).toHaveLength(0);
    expect(await readRuns(zoe, sourceId)).toHaveLength(0);
  });

  it('ne crée ni tour ni run quand le même élément revient', async () => {
    const connection = await seedConnection(paul);
    const item = normalized(
      connectorItem(`issue:${randomUUID()}`, [
        body('Texte stable.'),
        comment(1, 'Un commentaire.'),
      ]),
    );
    await ingestConnectorItems(paul, connection, [item]);
    vi.mocked(enqueuePipelineStep).mockReset();

    const again = await ingestConnectorItems(paul, connection, [item]);

    expect(again).toEqual({ sources: 1, turns: 0, runs: [] });
    expect(enqueuePipelineStep).not.toHaveBeenCalled();
  });

  it("ne traite que le commentaire ajouté et met le titre à jour quand l'élément s'allonge", async () => {
    const connection = await seedConnection(paul);
    const externalId = `issue:${randomUUID()}`;
    await ingestConnectorItems(paul, connection, [
      normalized(connectorItem(externalId, [body('Texte stable.')], 'Ancien titre')),
    ]);
    const sourceId = await sourceIdOf(paul, externalId);
    vi.mocked(enqueuePipelineStep).mockReset();

    const longer = await ingestConnectorItems(paul, connection, [
      normalized(
        connectorItem(
          externalId,
          [body('Texte stable.'), comment(2, 'Nouveau commentaire.')],
          'Nouveau titre',
        ),
      ),
    ]);

    expect(longer).toMatchObject({ sources: 1, turns: 1 });
    expect((await readSources(paul, sourceId))[0]?.title).toBe('Nouveau titre');
    const added = (await readTurns(paul, sourceId)).filter(
      (t) => t.text === 'Nouveau commentaire.',
    );
    const newRun = (await readRuns(paul, sourceId)).find((run) => run.id === longer.runs[0]);
    expect(newRun?.turnIds).toEqual(added.map((t) => t.id));
    expect(enqueuePipelineStep).toHaveBeenCalledOnce();
  });

  it("ne crée qu'un tour quand un seul paragraphe d'une longue page change", async () => {
    const connection = await seedConnection(paul);
    const externalId = `page:${randomUUID()}`;
    const paragraph = (word: string) => `${word} bêta gamma. `.repeat(350).trim();
    const page = (second: string) =>
      normalized(
        connectorItem(externalId, [
          body([paragraph('Alpha'), second, paragraph('Delta')].join('\n\n')),
        ]),
      );
    const first = await ingestConnectorItems(paul, connection, [page(paragraph('Epsilon'))]);
    expect(first.turns).toBe(3);

    const edited = await ingestConnectorItems(paul, connection, [page(paragraph('Zêta'))]);

    expect(edited.turns).toBe(1);
    expect(edited.runs).toHaveLength(1);
    const sourceId = await sourceIdOf(paul, externalId);
    expect(await readTurns(paul, sourceId)).toHaveLength(4);
  });

  it('crée une source et un run par élément quand trois arrivent en un appel', async () => {
    const connection = await seedConnection(paul);
    const items = [1, 2, 3].map((n) =>
      normalized(
        connectorItem(`issue:${randomUUID()}`, [body(`Ticket numéro ${n}.`)], `Ticket ${n}`),
      ),
    );

    const result = await ingestConnectorItems(paul, connection, items);

    expect(result).toMatchObject({ sources: 3, turns: 3 });
    expect(new Set(result.runs).size).toBe(3);
    expect(enqueuePipelineStep).toHaveBeenCalledTimes(3);
    for (const item of items) {
      const sourceId = await sourceIdOf(paul, item.externalId);
      expect(await readTurns(paul, sourceId)).toHaveLength(1);
      expect(await readRuns(paul, sourceId)).toHaveLength(1);
    }
  });

  it('range un titre vide comme « sans titre » plutôt que comme un texte vide', async () => {
    const connection = await seedConnection(paul);
    const externalId = `issue:${randomUUID()}`;

    await ingestConnectorItems(paul, connection, [
      normalized(connectorItem(externalId, [body('Texte.')], '  ')),
    ]);

    const [source] = await readSources(paul, await sourceIdOf(paul, externalId));
    expect(source?.title).toBeNull();
  });

  it("n'échoue pas quand la mise en file échoue : le run reste queued", async () => {
    const connection = await seedConnection(paul);
    const externalId = `issue:${randomUUID()}`;
    vi.mocked(enqueuePipelineStep).mockRejectedValueOnce(new Error('file indisponible'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ingestConnectorItems(paul, connection, [
      normalized(connectorItem(externalId, [body('Texte.')])),
    ]);

    expect(result.turns).toBe(1);
    const sourceId = await sourceIdOf(paul, externalId);
    expect((await readRuns(paul, sourceId))[0]?.status).toBe('queued');
    expect(spy).toHaveBeenCalledWith('[leon]', 'ingest.enqueue', expect.any(String));
    spy.mockRestore();
  });

  it("accepte un élément dont le texte, le titre, l'auteur, les identifiants, l'origine et l'adresse portent un octet nul", async () => {
    const connection = await seedConnection(paul);
    const nul = '\u0000';
    const externalId = `issue:${randomUUID()}`;
    const dirty = connectorItem(
      `${externalId.slice(0, 10)}${nul}${externalId.slice(10)}`,
      [
        {
          externalId: `bo${nul}dy`,
          role: 'document',
          author: { name: `Marie${nul} Durand`, email: `marie${nul}@acme.test` },
          text: `Le texte${nul} avec un octet nul.`,
          ts: '2026-10-14T09:00:00Z',
        },
      ],
      `Titre${nul} nul`,
    );
    dirty.url = `https://github.com/acme/leon/issues/${nul}1`;
    dirty.origin = { [`re${nul}po`]: `acme${nul}/leon` };

    const result = await ingestConnectorItems(paul, connection, [normalized(dirty)]);

    expect(result.turns).toBe(1);
    const sourceId = await sourceIdOf(paul, externalId);
    const [source] = await readSources(paul, sourceId);
    expect(source?.title).toBe('Titre nul');
    expect(source?.metadata).toMatchObject({ origin: { repo: 'acme/leon' } });
    expect((await readTurns(paul, sourceId))[0]).toMatchObject({
      text: 'Le texte avec un octet nul.',
      authorName: 'Marie Durand',
    });
  });

  // JSON.stringify écrit la moitié isolée d'un emoji « \ud83d » : un jsonb la refuse, un text non.
  it("accepte un élément dont le titre, l'origine et l'adresse portent la moitié isolée d'un emoji", async () => {
    const connection = await seedConnection(paul);
    const half = '\ud83d';
    const externalId = `issue:${randomUUID()}`;
    const dirty = connectorItem(
      `${externalId.slice(0, 10)}${half}${externalId.slice(10)}`,
      [
        {
          externalId: `bo${half}dy`,
          role: 'document',
          author: { name: `Marie${half} Durand`, email: 'marie@acme.test' },
          text: `Le texte${half} garde son 😀.`,
          ts: '2026-10-14T09:00:00Z',
        },
      ],
      `Titre${half} coupé`,
    );
    dirty.url = `https://github.com/acme/leon/issues/${half}1`;
    dirty.origin = { [`re${half}po`]: `acme${half}/leon` };

    const result = await ingestConnectorItems(paul, connection, [normalized(dirty)]);

    expect(result.turns).toBe(1);
    const sourceId = await sourceIdOf(
      paul,
      `${externalId.slice(0, 10)}\ufffd${externalId.slice(10)}`,
    );
    const [source] = await readSources(paul, sourceId);
    expect(source?.title).toBe('Titre\ufffd coupé');
    expect(source?.metadata).toMatchObject({
      url: 'https://github.com/acme/leon/issues/\ufffd1',
      origin: { 're\ufffdpo': 'acme\ufffd/leon' },
    });
    expect((await readTurns(paul, sourceId))[0]).toMatchObject({
      text: 'Le texte\ufffd garde son 😀.',
      authorName: 'Marie\ufffd Durand',
    });
  });
});
