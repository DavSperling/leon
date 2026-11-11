import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import { pool } from '@/server/db/client';
import { depotsEquipe } from '@/server/db/schema/connections';
import { sources } from '@/server/db/schema/memory';
import { briefings } from '@/server/db/schema/search';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';

// La mesure de T46 (plan de la mémoire à disposition), hors CI : `LEON_MESURE=oui pnpm test:db <ce fichier>`. Sur
// 10 000 sources et 500 fils d'un même auteur, chaque requête que POST /contexte envoie à la base est rejouée sous
// EXPLAIN (ANALYZE, BUFFERS), dans le contexte RLS de sa transaction (rôle leon_app, set_config), puis la route est
// chronométrée de bout en bout, sans le réseau entre le serveur et la base : le nombre d'allers-retours le donne.

const MESURE = process.env.LEON_MESURE === 'oui';
const PROJECT = 'github.com/acme/leon';
const FILS = 500;
const FILS_DU_PROJET = 300;
const SESSIONS = 5000;
const PRS = 3000;
const MESSAGES = 1500;
const RUNS = 30;

// La file des fils n'est pas mesurée : la route ne l'attend pas.
vi.mock('@/server/sessions/threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/sessions/threads-queue')>()),
  enqueueRangement: vi.fn(async () => undefined),
}));

// Chaque requête du rôle leon_app, avec le client qui l'envoie : une transaction se rejoue sur un seul client. Sur le
// prototype : drizzle et pg-pool passent par lui, quel que soit le client.
type Sent = { client: pg.Client; text: string; values: unknown[] };
let sent: Sent[] | null = null;
const query = pg.Client.prototype.query as (...args: unknown[]) => unknown;
if (MESURE) {
  (pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function (
    this: pg.Client,
    ...args: unknown[]
  ) {
    const [first, second] = args as [string | { text: string; values?: unknown[] }, unknown[]?];
    if (sent && this.user === 'leon_app') {
      const text = typeof first === 'string' ? first : first.text;
      const values = (typeof first === 'string' ? second : (first.values ?? second)) ?? [];
      sent.push({ client: this, text, values: Array.isArray(values) ? values : [] });
    }
    return query.apply(this, args);
  };
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const faits = (branche: string) => ({
  branche,
  prs: [{ repo: 'acme/leon', numero: 1, par: 'pr-link' }],
  commits: [],
  fichiers: ['a.ts'],
  commandes: [],
  taches: [{ texte: 'Une tâche', etat: 'a_faire' }],
  erreurs: 0,
  externe: false,
  echanges: 1,
  debut: null,
  fin: null,
});

async function seed() {
  const {
    members: [paul, marie],
  } = await createTestTenant(['Paul', 'Marie']);
  if (!paul || !marie) throw new Error('membres de test manquants');
  const own = (owner = paul) => ({
    tenantId: owner.tenantId,
    ownerUserId: owner.userId,
    acl: [owner.userId],
  });
  const sessions = Array.from({ length: SESSIONS }, (_, n) => ({
    ...own(n % 10 === 0 ? marie : paul),
    id: randomUUID(),
    kind: n % 3 === 0 ? ('codex' as const) : ('claude_code' as const),
    externalId: randomUUID(),
    lastTurnAt: ago(n < 3 ? 1 : n * 10),
    metadata: {
      project: n % 5 < 3 ? PROJECT : `github.com/acme/autre-${n % 7}`,
      branche: `paul/fil-${n % FILS}`,
      faits: faits(`paul/fil-${n % FILS}`),
      faits_le: ago(n < 3 ? 1 : n * 10).toISOString(),
      usages: ['resume'],
    },
  }));
  const prs = Array.from({ length: PRS }, (_, n) => ({
    ...own(),
    acl: [paul.tenantId],
    kind: 'github' as const,
    externalId: `pr:acme/leon#${n + 1}`,
    title: `#${n + 1} Une PR`,
    lastTurnAt: ago(n * 20),
    metadata: {
      url: `https://github.com/acme/leon/pull/${n + 1}`,
      updatedAt: ago(n * 20).toISOString(),
      origin: {
        repo: 'acme/leon',
        cote: 'equipe',
        tete: 'acme/leon',
        etat: n % 2 === 0 ? 'merged' : 'open',
        fini_le: ago(n * 20).toISOString(),
        auteur: 'paul-gh',
        branche: `paul/fil-${n % FILS}`,
      },
    },
  }));
  const messages = Array.from({ length: MESSAGES }, (_, n) => ({
    ...own(),
    acl: [paul.tenantId],
    id: randomUUID(),
    kind: 'slack' as const,
    externalId: randomUUID(),
    title: 'Canal produit',
    lastTurnAt: ago(n * 30),
  }));
  const fils = Array.from({ length: FILS }, (_, n) => ({
    ...own(),
    kind: 'leon_fil' as const,
    externalId: `leon:fil:${PROJECT}:${randomUUID()}`,
    metadata: {
      project: n < FILS_DU_PROJET ? PROJECT : `github.com/acme/autre-${n % 7}`,
      branches: [`paul/fil-${n}`],
      sessions: Array.from({ length: 10 }, (_, s) => sessions[(n + s * FILS) % SESSIONS]).map(
        (one) => ({ id: one?.id, kind: one?.kind, date: one?.lastTurnAt.toISOString() }),
      ),
      prs: [1, 2, 3].map((p) => ({ repo: 'acme/leon', numero: n * 3 + p, par: 'pr-link' })),
      liees: [1, 2, 3].map((l) => ({ id: messages[(n * 3 + l) % MESSAGES]?.id, cle: 'lien' })),
      tickets: [],
      maj_le: ago(n * 5).toISOString(),
    },
  }));
  for (const rows of [sessions, prs, messages, fils]) {
    for (const part of chunks<(typeof rows)[number]>(rows, 500)) {
      await adminDb.insert(sources).values(part as (typeof sources.$inferInsert)[]);
    }
  }
  await adminDb.insert(depotsEquipe).values({
    tenantId: paul.tenantId,
    project: PROJECT,
    acl: [paul.tenantId],
    choisiPar: paul.userId,
  });
  await seedConnection(paul, {
    label: 'paul-gh',
    config: { depots_confirmes: [{ depot: PROJECT, confirme_le: new Date().toISOString() }] },
  });
  await adminDb.insert(briefings).values({
    tenantId: paul.tenantId,
    userId: paul.userId,
    project: PROJECT,
    markdown: '# Point du matin\n- Le jeton est corrigé [1].',
    sourceIds: messages.slice(0, 20).map((one) => one.id),
    preparedAt: new Date(),
    stale: false,
    acl: [paul.userId],
  });
  await adminDb.execute('analyze sources');
  const { token } = await createApiToken(paul, 'mesure');
  return token;
}

const body = (lecture: boolean) => ({
  projet: PROJECT,
  branche: 'paul/fil-7',
  session: 'session-courante',
  ...(lecture ? { usages: ['lecture', 'resume'], commande: '~/.leon/bin/leon' } : {}),
});

type Plan = { 'Execution Time': number; 'Planning Time': number; Plan: Record<string, number> };

// Rejoue les requêtes d'un appel, transaction par transaction, chacune sous EXPLAIN ANALYZE (les écritures aussi, puis
// tout est annulé) ; les set_config de la transaction d'abord, tels quels.
async function explain(calls: Sent[]) {
  const results: Array<{
    requete: string;
    ms: number;
    planif: number;
    lus: number;
    caches: number;
  }> = [];
  for (const client of new Set(calls.map((one) => one.client))) {
    const own = calls.filter((one) => one.client === client && !/^(begin|commit)/i.test(one.text));
    const replay = await pool.connect();
    try {
      await replay.query('begin');
      for (const one of own) {
        if (/^\s*select set_config/i.test(one.text)) {
          await replay.query(one.text, one.values);
          continue;
        }
        const { rows } = await replay.query(
          `explain (analyze, buffers, format json) ${one.text}`,
          one.values,
        );
        const [plan] = (rows[0] as { 'QUERY PLAN': Plan[] })['QUERY PLAN'];
        results.push({
          requete: one.text.replace(/\s+/g, ' ').trim().slice(0, 90),
          ms: plan?.['Execution Time'] ?? 0,
          planif: plan?.['Planning Time'] ?? 0,
          lus: plan?.Plan['Shared Read Blocks'] ?? 0,
          caches: plan?.Plan['Shared Hit Blocks'] ?? 0,
        });
      }
    } finally {
      await replay.query('rollback');
      replay.release();
    }
  }
  return results;
}

const quantile = (values: number[], q: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] ??
  0;

describe.skipIf(!MESURE)('mesure de POST /api/v1/contexte (T46)', () => {
  it('EXPLAIN ANALYZE sous RLS de chaque requête, puis le chronométrage de bout en bout', async () => {
    const token = await seed();
    const call = (lecture: boolean) =>
      apiRequest(API_PATHS.contexte, { token, body: body(lecture) });
    for (let n = 0; n < 3; n++) {
      await call(true);
      await call(false);
    }

    for (const lecture of [true, false]) {
      sent = [];
      const response = await call(lecture);
      expect(response.status).toBe(200);
      const calls = sent;
      sent = null;
      const plans = await explain(calls);
      console.log(
        `\n${lecture ? 'avec' : 'sans'} lecture : ${calls.length} allers-retours, ${plans.length} requêtes`,
      );
      console.table(plans);
      console.log(
        `somme des exécutions : ${plans.reduce((sum, one) => sum + one.ms, 0).toFixed(1)} ms, planification : ${plans.reduce((sum, one) => sum + one.planif, 0).toFixed(1)} ms`,
      );
    }

    for (const lecture of [true, false]) {
      const times: number[] = [];
      for (let n = 0; n < RUNS; n++) {
        const started = performance.now();
        const response = await call(lecture);
        await response.text();
        times.push(performance.now() - started);
      }
      console.log(
        `${lecture ? 'avec' : 'sans'} lecture, ${RUNS} appels : médiane ${quantile(times, 0.5).toFixed(1)} ms, p95 ${quantile(times, 0.95).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms`,
      );
    }
  }, 300_000);
});
