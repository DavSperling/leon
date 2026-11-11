import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, NOTER_BODY_MAX_BYTES, NoterResponseSchema } from '@/capture/api-contract';
import { SECRET_MASK } from '@/capture/mask-secrets';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns, versionsMemoire } from '@/server/db/schema/memory';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { dropTeams, newTeam } from '@/test/seed-indexed';

// La route des notes (T57 ; C14, D30, D38 du plan de la mémoire à disposition) : le jeton avant le corps, 16 Kio au plus
// en `.strict()`, un 400 qui ne recopie aucune valeur, l'usage `noter`, puis writeNote. 201 { id, n }, ou 409.

vi.mock('@/server/pipeline/queue');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());
afterEach(() => {
  vi.restoreAllMocks();
});

type Member = TenantContext & { token: string };
async function member(): Promise<Member> {
  const { members } = await newTeam(['Paul'], tenantIds);
  const [paul] = members as [TenantContext];
  return { ...paul, token: (await createApiToken(paul, 'test')).token };
}

const base = {
  projet: PROJECT,
  outil: 'claude_code',
  session: 'session-1',
  texte: 'Le cache tombe le lundi.',
  usages: ['noter'],
};
const post = (token: string, body: Record<string, unknown>) =>
  apiRequest(API_PATHS.noter, { token, body: { ...base, ...body } });
const created = async (response: Response) => {
  expect(response.status).toBe(201);
  return NoterResponseSchema.parse(await response.json());
};
const versionsOf = (sourceId: string) =>
  adminDb
    .select({ n: versionsMemoire.n, outil: versionsMemoire.outil })
    .from(versionsMemoire)
    .where(eq(versionsMemoire.sourceId, sourceId))
    .orderBy(asc(versionsMemoire.n));
const notesOf = (ctx: TenantContext) =>
  adminDb.select().from(sources).where(eq(sources.ownerUserId, ctx.userId));

describe('POST /api/v1/noter', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.noter, { body: base });
    expect(response.status).toBe(401);
  });

  it('écrit une note neuve, avec son projet, son outil et sa session : 201 { id, n }', async () => {
    const paul = await member();

    const { id, n } = await created(await post(paul.token, {}));

    expect(n).toBe(1);
    const [source] = await notesOf(paul);
    expect(source).toMatchObject({
      id,
      kind: 'mcp_remember',
      acl: [paul.userId],
      metadata: { outil: 'claude_code', session: 'session-1', project: PROJECT },
    });
    expect(await versionsOf(id)).toEqual([{ n: 1, outil: 'claude_code' }]);
    expect(enqueuePipelineStep).toHaveBeenCalledTimes(1);
  });

  it('écrit la version suivante, et répond 409 à une version dépassée ou à un autre outil, sans rien changer', async () => {
    const paul = await member();
    const { id } = await created(await post(paul.token, {}));

    expect(await created(await post(paul.token, { texte: 'Deux.', note: id, version: 1 }))).toEqual(
      { id, n: 2 },
    );
    const stale = await post(paul.token, { texte: 'Trois.', note: id, version: 1 });
    const other = await post(paul.token, { texte: 'Trois.', outil: 'codex', note: id, version: 2 });
    const unknown = await post(paul.token, {
      texte: 'Trois.',
      note: crypto.randomUUID(),
      version: 1,
    });

    expect([stale.status, other.status, unknown.status]).toEqual([409, 409, 409]);
    expect(await versionsOf(id)).toEqual([
      { n: 1, outil: 'claude_code' },
      { n: 2, outil: 'claude_code' },
    ]);
    expect(
      (await adminDb.select({ text: turns.text }).from(turns).where(eq(turns.sourceId, id))).map(
        (turn) => turn.text,
      ),
    ).toEqual(['Deux.']);
  });

  it('refuse sans l’usage noter, même avec lecture, sans rien écrire', async () => {
    const paul = await member();

    for (const usages of [['lecture'], [], ['lecture', 'rappel', 'resume']]) {
      const response = await post(paul.token, { usages });
      expect(response.status, usages.join(',')).toBe(403);
    }
    expect(await notesOf(paul)).toEqual([]);
  });

  it('répond 400 hors du schéma, sans recopier aucune valeur reçue', async () => {
    const paul = await member();
    const secret = 'valeur-reçue-zorglub';

    for (const body of [
      { outil: `mcp:${secret}` },
      { outil: 'github' },
      { projet: `https://${secret}@gitlab.com/a/b` },
      { texte: '' },
      { texte: 'x'.repeat(4001) },
      { session: 's'.repeat(201) },
      { note: crypto.randomUUID() },
      { version: 1 },
      { note: secret, version: 1 },
      { inconnu: secret },
      { usages: [secret] },
    ]) {
      const response = await post(paul.token, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.text()).not.toContain('zorglub');
    }
    // Un texte qui ne garde rien une fois nettoyé : 400 aussi.
    expect((await post(paul.token, { texte: '   ' })).status).toBe(400);
    expect(await notesOf(paul)).toEqual([]);
  });

  it('répond 413 à un corps de 16 Kio + 1 octet', async () => {
    const paul = await member();
    const body = JSON.stringify({ ...base, texte: 'x'.repeat(NOTER_BODY_MAX_BYTES) });

    const response = await apiRequest(API_PATHS.noter, {
      token: paul.token,
      body: JSON.parse(body),
    });

    expect(response.status).toBe(413);
  });

  it('masque de nouveau le texte, et ne le journalise jamais', async () => {
    const paul = await member();
    const key = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT'.repeat(2)}`;
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];

    const { id } = await created(await post(paul.token, { texte: `Quokka : ${key}` }));

    const [version] = await adminDb
      .select({ texte: versionsMemoire.texte })
      .from(versionsMemoire)
      .where(eq(versionsMemoire.sourceId, id));
    expect(version?.texte).toBe(`Quokka : ${SECRET_MASK}`);
    const written = logs.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)));
    expect(written.join('\n')).not.toMatch(/Quokka|sk-ant/);
  });
});
