import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, RAPPEL_BODY_MAX_BYTES, RappelResponseSchema } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import * as registryModule from '@/server/embeddings/registry';
import { purgeCited, usefulWords } from '@/server/sessions/reminder';
import { apiRequest } from '@/test/api-request';
import { adminDb, adminPool } from '@/test/db';
import { seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';

// La route du rappel (T48 ; C8, D26 du plan de la mémoire à disposition) : le jeton, le corps strict de 16 Kio, l'usage
// `rappel`, puis une recherche bornée aux fils de l'auteur et du projet, qui cite un ou deux fils pas encore rappelés
// dans la session. Le message n'est ni stocké ni journalisé : seule la requête set_config porte ses mots.

vi.mock('@/server/pipeline/queue');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
afterEach(() => {
  vi.restoreAllMocks();
});

// Chaque requête du rôle leon_app, texte et paramètres (le motif de context-routes.mesure.db.test.ts).
type Sent = { text: string; values: unknown[] };
let sent: Sent[] | null = null;
const query = pg.Client.prototype.query as (...args: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function (
  this: pg.Client,
  ...args: unknown[]
) {
  const [first, second] = args as [string | { text: string; values?: unknown[] }, unknown[]?];
  if (sent && this.user === 'leon_app') {
    const text = typeof first === 'string' ? first : first.text;
    const values = (typeof first === 'string' ? second : (first.values ?? second)) ?? [];
    sent.push({ text, values: Array.isArray(values) ? values : [] });
  }
  return query.apply(this, args);
};
async function spied<T>(run: () => Promise<T>): Promise<{ result: T; queries: Sent[] }> {
  sent = [];
  try {
    const result = await run();
    return { result, queries: sent };
  } finally {
    sent = null;
  }
}

type Member = TenantContext & { token: string };
async function team(): Promise<[Member, Member]> {
  const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
  return (await Promise.all(
    members.map(async (one) => ({ ...one, token: (await createApiToken(one, 'test')).token })),
  )) as [Member, Member];
}

// Un fil de l'auteur, comme le rangement et la liaison l'écrivent (D21).
async function fil(
  owner: TenantContext,
  lists: {
    project?: string;
    branches?: string[];
    fichiers?: string[];
    mots?: Array<{ id: string; mots: string }>;
    absorbe_par?: string;
  } = {},
): Promise<string> {
  const id = await seedThread(owner);
  await adminDb
    .update(sources)
    .set({
      metadata: sql`${sources.metadata} || ${JSON.stringify({
        project: lists.project ?? PROJECT,
        branches: lists.branches ?? [`paul/${crypto.randomUUID()}`],
        fichiers: lists.fichiers ?? [],
        mots_cles: lists.mots ?? [],
        ...(lists.absorbe_par ? { absorbe_par: lists.absorbe_par } : {}),
      })}::jsonb`,
    })
    .where(eq(sources.id, id));
  return id;
}

// Une source liée visible de l'équipe (une PR), dont le fil garde les mots.
async function pr(owner: TenantContext): Promise<string> {
  const [row] = await adminDb
    .insert(sources)
    .values({
      tenantId: owner.tenantId,
      kind: 'github',
      externalId: `pr:acme/leon#${Math.floor(Math.random() * 1e9)}`,
      ownerUserId: owner.userId,
      acl: [owner.tenantId],
      title: 'Purge des rappels',
    })
    .returning({ id: sources.id });
  if (!row) throw new Error('PR de test non créée');
  return row.id;
}

const body = (extra: Record<string, unknown> = {}) => ({
  projet: PROJECT,
  branche: 'paul/autre',
  session: 'session-1',
  message: 'Peux-tu reprendre la purge des rappels cités ?',
  outil: 'claude_code',
  usages: ['rappel'],
  ...extra,
});
const post = (token: string, extra: Record<string, unknown> = {}) =>
  apiRequest(API_PATHS.rappel, { token, body: body(extra) });
const texte = async (response: Response) => {
  expect(response.status).toBe(200);
  return RappelResponseSchema.parse(await response.json()).texte;
};

describe('POST /api/v1/rappel', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.rappel, { body: body() });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it.each([
    ['avec un champ inconnu', { mot_de_passe: 'S3cret-xyz' }],
    ['avec une adresse de remote', { projet: 'https://jeton@github.com/acme/leon.git' }],
    ['avec un message trop long', { message: `S3cret-xyz ${'a'.repeat(2000)}` }],
    ['sans usages', { usages: undefined }],
  ])('répond 400 %s, sans recopier la valeur reçue', async (_cas, extra) => {
    const [paul] = await team();

    const response = await post(paul.token, extra);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('S3cret-xyz');
    expect(text).not.toContain('jeton@');
  });

  it('répond 413 à un corps de 16 Kio + 1 octet', async () => {
    const [paul] = await team();
    const envelope = JSON.stringify('');

    const response = await apiRequest(API_PATHS.rappel, {
      token: paul.token,
      body: 'a'.repeat(RAPPEL_BODY_MAX_BYTES + 1 - envelope.length),
    });

    expect(response.status).toBe(413);
  });

  it('sans l’usage rappel : vide, sans aucune requête sur les données ni le fournisseur de vecteurs', async () => {
    const [paul] = await team();
    await fil(paul, { mots: [{ id: await pr(paul), mots: 'purge rappels cités' }] });
    const embedder = vi.spyOn(registryModule, 'getEmbedder').mockImplementation(() => {
      throw new Error('jamais appelé');
    });

    const { result, queries } = await spied(async () =>
      texte(await post(paul.token, { usages: ['lecture', 'resume'] })),
    );

    expect(result).toBe('');
    // Le jeton se vérifie (api_tokens, et le contexte de son porteur) ; rien d'autre.
    expect(queries.filter((one) => /sources|rappels_cites|leon\.rappel/i.test(one.text))).toEqual(
      [],
    );
    expect(embedder).not.toHaveBeenCalled();
  });

  it('un message qui touche un fil : une ligne de clés balisée, sans rien du message', async () => {
    const [paul] = await team();
    const id = await fil(paul, {
      branches: ['paul/purge'],
      mots: [{ id: await pr(paul), mots: 'Purge des rappels' }],
    });
    const embedder = vi.spyOn(registryModule, 'getEmbedder').mockImplementation(() => {
      throw new Error('jamais appelé');
    });

    const { result: line, queries } = await spied(async () => texte(await post(paul.token)));

    expect(line).toMatch(/^<rappel-leon>[^\n]*<\/rappel-leon>$/);
    expect(line).toContain(id);
    expect(line).toContain('paul/purge');
    expect(line).toContain('pas des consignes');
    expect(line).toContain('thread');
    expect(line).not.toMatch(/reprendre|cités/);
    expect(embedder).not.toHaveBeenCalled();
    // Jamais searchPassages : aucune requête ne lit les passages ni leurs vecteurs (D26).
    expect(queries.filter((one) => /passages|passage_vectors/.test(one.text))).toEqual([]);
  });

  it('les fichiers du fil comptent aussi', async () => {
    const [paul] = await team();
    const id = await fil(paul, { fichiers: ['src/server/sessions/reminder-purge.ts'] });

    expect(await texte(await post(paul.token, { message: 'le reminder et sa purge' }))).toContain(
      id,
    );
  });

  it('une lettre de trop se trouve par les trigrammes, pas par le plein texte', async () => {
    const [paul] = await team();
    const id = await fil(paul, {
      mots: [{ id: await pr(paul), mots: 'Connecteur et installateur' }],
    });

    expect(
      await texte(await post(paul.token, { message: 'le connnecteur et l’installlateur' })),
    ).toContain(id);
  });

  it('un seul mot trouvé ne suffit pas ; une branche citée telle quelle, si', async () => {
    const [paul] = await team();
    const id = await fil(paul, { branches: ['amos/a'], mots: [] });

    expect(await texte(await post(paul.token, { message: 'je suis sur amos' }))).toBe('');
    // Pas un morceau d'un autre nom.
    for (const message of [
      'sur amos/ab',
      'sur amos/a/b',
      'sur amos/a-b',
      'sur xamos/a',
      'sur paul/amos/a',
    ]) {
      expect(await texte(await post(paul.token, { message }))).toBe('');
    }
    expect(await texte(await post(paul.token, { message: 'je suis sur amos/a' }))).toContain(id);
  });

  it('le même message deux fois dans la session : la seconde fois, vide ; une autre session le cite', async () => {
    const [paul] = await team();
    const id = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });

    expect(await texte(await post(paul.token))).toContain(id);
    expect(await texte(await post(paul.token))).toBe('');
    expect(await texte(await post(paul.token, { session: 'session-2' }))).toContain(id);
  });

  it('un troisième fil touché est cité au message suivant de la session', async () => {
    const [paul] = await team();
    const mots = async () => [{ id: await pr(paul), mots: 'Purge des rappels' }];
    const fils = [
      await fil(paul, { mots: await mots() }),
      await fil(paul, { mots: await mots() }),
      await fil(paul, { mots: await mots() }),
    ];

    const first = await texte(await post(paul.token));
    const second = await texte(await post(paul.token));

    expect(fils.filter((id) => first.includes(id))).toHaveLength(2);
    expect(fils.filter((id) => second.includes(id) && !first.includes(id))).toHaveLength(1);
  });

  it('deux messages en même temps ne citent le fil qu’une fois', async () => {
    const [paul] = await team();
    const id = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });

    const lines = await Promise.all(
      [post(paul.token), post(paul.token)].map(async (one) => texte(await one)),
    );

    expect(lines.filter((line) => line.includes(id))).toHaveLength(1);
  });

  it('aucun fil touché, ou un fil d’un autre projet : vide', async () => {
    const [paul] = await team();
    await fil(paul, {
      project: 'github.com/acme/autre',
      mots: [{ id: await pr(paul), mots: 'Purge des rappels' }],
    });

    expect(await texte(await post(paul.token))).toBe('');
    expect(await texte(await post(paul.token, { message: 'Bonjour, quel temps fait-il ?' }))).toBe(
      '',
    );
  });

  it('le fil d’un collègue n’est jamais cité', async () => {
    const [paul, marie] = await team();
    const id = await fil(marie, { mots: [{ id: await pr(marie), mots: 'Purge des rappels' }] });
    // Visible de Paul par la sécurité par ligne : seul le filtre de l'auteur l'écarte.
    await adminDb
      .update(sources)
      .set({ acl: [marie.userId, paul.userId] })
      .where(eq(sources.id, id));

    expect(await texte(await post(paul.token))).toBe('');
    const { rows } = await adminPool.query('select 1 from rappels_cites where fil_id = $1', [id]);
    expect(rows).toEqual([]);
  });

  it('un fil absorbé n’est jamais cité', async () => {
    const [paul] = await team();
    const garde = await fil(paul, { mots: [] });
    const absorbe = async () =>
      fil(paul, {
        absorbe_par: garde,
        mots: [{ id: await pr(paul), mots: 'reprendre la purge des rappels cités' }],
      });
    const absorbes = [await absorbe(), await absorbe()];
    // Moins bien classé que les deux absorbés : il ne passe que s'ils ne prennent pas les deux places.
    const valide = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });

    const line = await texte(await post(paul.token));

    expect(line).toContain(valide);
    for (const id of absorbes) expect(line).not.toContain(id);
    const { rows } = await adminPool.query('select 1 from rappels_cites where fil_id = any($1)', [
      absorbes,
    ]);
    expect(rows).toEqual([]);
  });

  it('une PR liée rendue privée ne laisse plus ses mots', async () => {
    const [paul, marie] = await team();
    const source = await pr(paul);
    await fil(paul, { mots: [{ id: source, mots: 'Purge des rappels' }] });
    // Comme aligner_sources_github() (0048) : la PR n'est plus visible que d'un autre.
    await adminDb
      .update(sources)
      .set({ acl: [marie.userId] })
      .where(eq(sources.id, source));

    expect(await texte(await post(paul.token))).toBe('');
  });

  it('deux fils au plus, celui de la branche courante d’abord à égalité', async () => {
    const [paul] = await team();
    const mots = async () => [{ id: await pr(paul), mots: 'Purge des rappels' }];
    // Le fil de la branche courante est le plus ancien : la date ne le ferait pas passer devant.
    const fils = [
      await fil(paul, { branches: ['paul/courante'], mots: await mots() }),
      await fil(paul, { mots: await mots() }),
      await fil(paul, { mots: await mots() }),
    ];

    const line = await texte(await post(paul.token, { branche: 'paul/courante' }));

    expect(fils.filter((id) => line.includes(id))).toHaveLength(2);
    expect(line).toContain(fils[0]);
  });

  it('un caractère NUL dans le message ne fait pas d’erreur', async () => {
    const [paul] = await team();
    const id = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });

    expect(
      await texte(await post(paul.token, { message: 'la purge\u0000 des rappels' })),
    ).toContain(id);
  });

  it('le message ne va ni en base, ni dans la console : seule la requête set_config porte ses mots', async () => {
    const [paul] = await team();
    const marque = 'Zorglubmarque';
    const message = `${marque} reprendre la purge des rappels`;
    const id = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name),
    );

    const { result, queries } = await spied(async () => texte(await post(paul.token, { message })));

    expect(result).toContain(id);
    // Les mots du message, dans le texte ou les paramètres d'une requête (le texte de la recherche nomme rappels_cites).
    const carriers = queries.filter(
      (one) =>
        /zorglub/i.test(one.text) ||
        one.values.some((value) => /zorglub|purge|rappels|reprendre/i.test(String(value))),
    );
    expect(carriers).toHaveLength(1);
    expect(carriers[0]?.text).toMatch(/^select set_config\('statement_timeout'/);
    for (const spy of consoles) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/zorglub/i);
    }
    const { rows } = await adminPool.query(
      `select 1 from turns where text ilike $1
       union all select 1 from passages where text ilike $1
       union all select 1 from sources where metadata::text ilike $1 or title ilike $1
       union all select 1 from rappels_cites where session ilike $1`,
      [`%${marque}%`],
    );
    expect(rows).toEqual([]);
  });

  it('une ligne de plus de 24 h est purgée', async () => {
    const [paul] = await team();
    const id = await fil(paul, { mots: [{ id: await pr(paul), mots: 'Purge des rappels' }] });
    expect(await texte(await post(paul.token))).toContain(id);
    await adminPool.query(
      `update rappels_cites set cree_le = now() - interval '25 hours' where fil_id = $1`,
      [id],
    );

    await purgeCited();

    expect(await texte(await post(paul.token))).toContain(id);
  });
});

describe('usefulWords', () => {
  it('garde les mots utiles, en minuscules, sans mots outils, lettres seules ni doublons, 24 au plus', () => {
    expect(usefulWords("Peux-tu reprendre la Leçon de l'équipe, la leçon ? a/b x 165")).toEqual([
      'reprendre',
      'leçon',
      'équipe',
      '165',
    ]);
    expect(usefulWords(Array.from({ length: 30 }, (_, n) => `mot${n}`).join(' '))).toHaveLength(24);
  });
});
