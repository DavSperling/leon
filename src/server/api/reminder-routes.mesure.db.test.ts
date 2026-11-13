import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import { sources } from '@/server/db/schema/memory';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// La mesure de T48 (plan de la mémoire à disposition), hors CI : `LEON_MESURE=oui pnpm test:db <ce fichier>`. Sur 50
// puis 300 fils d'un même auteur (50 fichiers et une dizaine de sources liées chacun, 2 000 caractères de mots ;
// au-delà de 100 fils, seuls les plus récents sont lus, FILS_MAX de reminder.ts), et 2 000 autres sources, POST /rappel est
// chronométrée dans le processus, sans le réseau entre le serveur et la base, avec un message de 2 000 caractères. Une
// session neuve par appel : la recherche et l'écriture des fils cités tournent à chaque fois.
// 300 ms visés (D26).

const MESURE = process.env.LEON_MESURE === 'oui';
const PROJECT = 'github.com/acme/leon';
const LIEES = 12;
const AUTRES = 2000;
const RUNS = 30;
const MOTS = [
  'purge',
  'rappel',
  'jeton',
  'facture',
  'connecteur',
  'sommaire',
  'migration',
  'version',
  'leçon',
  'installateur',
  'recherche',
  'vecteur',
];

const quantile = (values: number[], q: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] ??
  0;

async function seed(nombre: number) {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const own = { tenantId: paul.tenantId, ownerUserId: paul.userId };
  const liees = Array.from({ length: nombre * LIEES }, (_, n) => ({
    ...own,
    acl: [paul.tenantId],
    id: randomUUID(),
    kind: 'github' as const,
    externalId: `pr:acme/leon#${n + 1}`,
    title: `#${n + 1} ${MOTS[n % MOTS.length]} et ${MOTS[(n * 5) % MOTS.length]} du module ${n}`,
  }));
  const autres = Array.from({ length: AUTRES }, () => ({
    ...own,
    acl: [paul.tenantId],
    kind: 'slack' as const,
    externalId: randomUUID(),
    title: 'Canal produit',
  }));
  const fils = Array.from({ length: nombre }, (_, n) => ({
    ...own,
    acl: [paul.userId],
    kind: 'leon_fil' as const,
    externalId: `leon:fil:${PROJECT}:${randomUUID()}`,
    metadata: {
      project: PROJECT,
      branches: [`paul/fil-${n}-${MOTS[n % MOTS.length]}`],
      fichiers: Array.from(
        { length: 50 },
        (_, f) => `src/server/${MOTS[(n + f) % MOTS.length]}/module-${f}.ts`,
      ),
      mots_cles: liees.slice(n * LIEES, (n + 1) * LIEES).map((one) => ({
        id: one.id,
        mots: `${one.title} ${'détail '.repeat(20)}`.slice(0, 160),
      })),
      maj_le: new Date(Date.now() - n * 60_000).toISOString(),
    },
  }));
  for (const rows of [liees, autres, fils]) {
    for (let i = 0; i < rows.length; i += 500) {
      await adminDb
        .insert(sources)
        .values(rows.slice(i, i + 500) as (typeof sources.$inferInsert)[]);
    }
  }
  await adminDb.execute('analyze sources');
  const { token } = await createApiToken(paul, 'mesure');
  return token;
}

// Un message de 2 000 caractères, de mots courants, dont quelques-uns touchent des fils.
const MESSAGE =
  `Peux-tu reprendre la purge du rappel et vérifier la migration du sommaire ? ${'Le travail avance bien, on regarde les détails ensemble demain matin. '.repeat(40)}`.slice(
    0,
    2000,
  );

describe.skipIf(!MESURE)('mesure de POST /api/v1/rappel (T48)', () => {
  it.each([50, 300])(
    'le chronométrage de bout en bout, sur %i fils',
    async (nombre) => {
      const token = await seed(nombre);
      const call = () =>
        apiRequest(API_PATHS.rappel, {
          token,
          body: {
            projet: PROJECT,
            branche: 'paul/fil-7-version',
            session: randomUUID(),
            message: MESSAGE,
            outil: 'claude_code',
            usages: ['rappel'],
          },
        });
      for (let n = 0; n < 3; n++) await call();

      const times: number[] = [];
      let cites = 0;
      for (let n = 0; n < RUNS; n++) {
        const started = performance.now();
        const response = await call();
        const { texte } = (await response.json()) as { texte: string };
        times.push(performance.now() - started);
        expect(response.status).toBe(200);
        if (texte !== '') cites++;
      }
      console.log(
        `rappel, ${RUNS} appels sur ${nombre} fils (${cites} avec une ligne) : médiane ${quantile(times, 0.5).toFixed(1)} ms, p95 ${quantile(times, 0.95).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms`,
      );
    },
    300_000,
  );
});
