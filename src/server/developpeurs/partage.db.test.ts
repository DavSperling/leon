import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { searchPassages } from '@/server/search/search';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { lastSession, setRepoSharing, setSessionSharing } from './partage';

// L'indexation signale les projets au point du matin : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const embedder = createFakeEmbedder();
const APP = 'github.com/acme/app';
const DAY = 86_400_000;

// Un mot que seule cette session contient (lettres seulement, pour le plein texte).
const word = () => `cache${randomUUID().replace(/[^a-f]/g, '')}`;

async function team() {
  const { tenantId, members } = await newTeam(['Paul', 'Marie'], tenantIds);
  const other = await newTeam(['Zoé'], tenantIds);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { tenantId, paul, marie, zoe: other.members[0] as TenantContext };
}

// Une session Claude Code partagée et indexée (passages et vecteurs), dont le texte porte `token`.
const sharedSession = (
  owner: TenantContext,
  token: string,
  input: { project?: string; kind?: 'claude_code' | 'claude_ai'; lastTurnAt?: Date } = {},
) =>
  seedIndexed(
    owner,
    {
      kind: input.kind ?? 'claude_code',
      acl: [owner.tenantId],
      title: `Session ${token}`,
      metadata: { project: input.project ?? APP },
      lastTurnAt: input.lastTurnAt ?? new Date(),
      turns: [{ text: `Réglage du cache ${token}` }],
    },
    embedder,
  );

const hits = async (ctx: TenantContext, token: string) =>
  (await searchPassages(ctx, { query: token, embedder })).hits.map((hit) => hit.sourceId);

// L'accès de la source sur chacune des cinq tables.
async function aclOf(sourceId: string): Promise<Record<string, string[]>> {
  const { rows } = await adminPool.query<{ t: string; acl: string[] }>(
    `select 'sources' as t, acl::text[] as acl from sources where id = $1
     union all select distinct 'turns', acl::text[] from turns where source_id = $1
     union all select distinct 'ingest_runs', acl::text[] from ingest_runs where source_id = $1
     union all select distinct 'passages', acl::text[] from passages where source_id = $1
     union all select distinct 'passage_vectors', v.acl::text[]
       from passage_vectors v join passages p on p.id = v.passage_id where p.source_id = $1`,
    [sourceId],
  );
  return Object.fromEntries(rows.map((row) => [row.t, row.acl]));
}

const everywhere = (acl: string[]) => ({
  sources: acl,
  turns: acl,
  ingest_runs: acl,
  passages: acl,
  passage_vectors: acl,
});

describe('setSessionSharing', () => {
  it('rendre une session privée la retire de la recherche d’un collègue, passages et vecteurs compris', async () => {
    const { tenantId, paul, marie, zoe } = await team();
    const token = word();
    const { sourceId } = await sharedSession(paul, token);
    expect(await hits(marie, token)).toContain(sourceId);
    expect(await hits(zoe, token)).not.toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));

    const changed = await setSessionSharing(paul, sourceId, false);

    expect(changed).toMatchObject({ id: sourceId, title: `Session ${token}` });
    expect(await hits(marie, token)).not.toContain(sourceId);
    expect(await hits(paul, token)).toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([paul.userId]));
  });

  it('seul l’auteur règle le partage de sa session', async () => {
    const { tenantId, paul, marie, zoe } = await team();
    const { sourceId } = await sharedSession(paul, word());

    expect(await setSessionSharing(marie, sourceId, false)).toBeNull();
    expect(await setSessionSharing(zoe, sourceId, false)).toBeNull();
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));
  });

  it('partager de nouveau une session la rend visible', async () => {
    const { tenantId, paul, marie } = await team();
    const token = word();
    const { sourceId } = await sharedSession(paul, token);
    await setSessionSharing(paul, sourceId, false);

    expect(await setSessionSharing(paul, sourceId, true)).not.toBeNull();
    expect(await hits(marie, token)).toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));
  });

  it('ne touche ni une session sans clé GitHub ni une session claude_ai', async () => {
    const { paul } = await team();
    const dossier = await sharedSession(paul, word(), { project: 'dossier:0123456789abcdef' });
    const chat = await sharedSession(paul, word(), { kind: 'claude_ai' });

    expect(await setSessionSharing(paul, dossier.sourceId, false)).toBeNull();
    expect(await setSessionSharing(paul, chat.sourceId, false)).toBeNull();
  });
});

describe('setRepoSharing', () => {
  it('rend privées toutes les sessions passées du dépôt, et elles seules ; le partage les rend', async () => {
    const { paul, marie } = await team();
    const [a, b, c] = [word(), word(), word()];
    const first = await sharedSession(paul, a);
    const second = await sharedSession(paul, b);
    const elsewhere = await sharedSession(paul, c, { project: 'github.com/acme/autre' });

    expect(await setRepoSharing(paul, APP, false)).toBe(2);
    expect(await hits(marie, a)).not.toContain(first.sourceId);
    expect(await hits(marie, b)).not.toContain(second.sourceId);
    expect(await hits(marie, c)).toContain(elsewhere.sourceId);
    const { rows } = await adminPool.query('select project from depots_prives where user_id = $1', [
      paul.userId,
    ]);
    expect(rows).toEqual([{ project: APP }]);

    expect(await setRepoSharing(paul, APP, true)).toBe(2);
    expect(await hits(marie, a)).toContain(first.sourceId);
    expect(
      (await adminPool.query('select 1 from depots_prives where user_id = $1', [paul.userId]))
        .rowCount,
    ).toBe(0);
  });

  it('ne touche pas aux sessions des autres sur ce dépôt', async () => {
    const { paul, marie } = await team();
    const token = word();
    const hers = await sharedSession(marie, token);

    expect(await setRepoSharing(paul, APP, false)).toBe(0);
    expect(await hits(paul, token)).toContain(hers.sourceId);
  });
});

describe('lastSession', () => {
  it('rend la dernière session partagée, ou la dernière privée, de l’auteur', async () => {
    const { paul } = await team();
    const older = await sharedSession(paul, word(), { lastTurnAt: new Date(Date.now() - DAY) });
    const newer = await sharedSession(paul, word());

    expect(await lastSession(paul, true)).toBe(newer.sourceId);
    await setSessionSharing(paul, newer.sourceId, false);
    expect(await lastSession(paul, true)).toBe(older.sourceId);
    expect(await lastSession(paul, false)).toBe(newer.sourceId);
  });
});
