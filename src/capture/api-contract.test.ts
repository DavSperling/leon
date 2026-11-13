import { describe, expect, it } from 'vitest';
import {
  ChercherRequestSchema,
  COULISSES_BLOCS_MAX,
  CoulissesRequestSchema,
  DossierRequestSchema,
  FilRequestSchema,
  VersionsRequestSchema,
} from './api-contract';

// Les corps des routes de lecture (C9, C11, C12) : la CLI et le serveur valident les mêmes.
const base = { projet: 'github.com/acme/leon', usages: ['lecture'] };

describe('corps des lectures', () => {
  it('acceptent le minimum, une branche nulle (tête détachée), la session et l’outil', () => {
    expect(DossierRequestSchema.safeParse(base).success).toBe(true);
    expect(
      FilRequestSchema.safeParse({
        ...base,
        id: crypto.randomUUID(),
        branche: null,
        session: 's-1',
        outil: 'claude_code',
      }).success,
    ).toBe(true);
    expect(ChercherRequestSchema.safeParse({ ...base, requete: 'reprise' }).success).toBe(true);
    const id = crypto.randomUUID();
    expect(VersionsRequestSchema.safeParse({ ...base, id }).success).toBe(true);
    expect(VersionsRequestSchema.safeParse({ ...base, id, n: 2 }).success).toBe(true);
  });

  it.each([
    ['une clé en trop', DossierRequestSchema, { ...base, max: 10 }],
    ['sans usages', DossierRequestSchema, { projet: base.projet }],
    ['une session de 201 caractères', DossierRequestSchema, { ...base, session: 's'.repeat(201) }],
    ['un outil inconnu', DossierRequestSchema, { ...base, outil: 'vim' }],
    ['un id qui n’est pas un uuid', FilRequestSchema, { ...base, id: 'fil-1' }],
    ['une requête vide', ChercherRequestSchema, { ...base, requete: '' }],
    [
      'une branche dans chercher',
      ChercherRequestSchema,
      { ...base, requete: 'x', branche: 'main' },
    ],
    ['des versions sans id', VersionsRequestSchema, base],
    ['une version 0', VersionsRequestSchema, { ...base, id: crypto.randomUUID(), n: 0 }],
    // Aucune restauration par le poste (D33, tranché le 05/11) : le corps ne peut pas en demander une.
    [
      'une restauration',
      VersionsRequestSchema,
      { ...base, id: crypto.randomUUID(), n: 1, restaurer: true },
    ],
  ] as const)('refusent %s', (_label, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });
});

// Le corps des coulisses (C10 amendé le 12/11) : trois formes de bloc, chacune en `.strict()`, distinguées par `role`.
describe('corps des coulisses', () => {
  const ts = '2026-11-12T10:00:00+01:00';
  const raisonnement = { role: 'raisonnement', id: 'a1b2-uuid', ts, texte: 'Je lis le fichier.' };
  const consigne = {
    role: 'sous_agent',
    id: 'toolu_01:consigne',
    ts,
    partie: 'consigne',
    texte: 'Lis a.txt',
  };
  const appel = {
    role: 'appel_outil',
    id: 'toolu_01',
    ts,
    outil: 'Read',
    cible: 'src/a.ts',
    statut: 'ok',
  };
  const body = (blocs: unknown[], extra: Record<string, unknown> = {}) => ({
    kind: 'claude_code',
    external_id: 'session-1',
    usages: ['coulisses'],
    blocs,
    ...extra,
  });
  const ok = (value: unknown) => CoulissesRequestSchema.safeParse(value).success;

  it.each([
    ['les trois formes', body([raisonnement, consigne, appel])],
    ['un appel sans cible', body([{ ...appel, cible: undefined }])],
    ['un appel sans résultat', body([{ ...appel, statut: 'sans_resultat' }])],
    ['un rapport', body([{ ...consigne, id: 'toolu_01:rapport', partie: 'rapport' }])],
    ['la date de l’accord', body([raisonnement], { accord_le: '2026-11-10T09:00:00.000Z' })],
    ['sans usages', body([raisonnement], { usages: undefined })],
    [
      `${COULISSES_BLOCS_MAX} blocs`,
      body(Array.from({ length: COULISSES_BLOCS_MAX }, () => raisonnement)),
    ],
  ])('accepte %s', (_, value) => {
    expect(ok(value)).toBe(true);
  });

  it.each([
    ['un appel avec un texte', body([{ ...appel, texte: 'sortie' }])],
    ['un appel avec une sortie', body([{ ...appel, sortie: 'x' }])],
    ['un raisonnement avec un outil', body([{ ...raisonnement, outil: 'Read' }])],
    ['un champ inconnu dans le corps', body([raisonnement], { titre: 'x' })],
    ['un rôle inconnu', body([{ ...raisonnement, role: 'user' }])],
    ['une partie inconnue', body([{ ...consigne, partie: 'resultat' }])],
    ['un statut inconnu', body([{ ...appel, statut: 'refuse' }])],
    ['un id hors forme', body([{ ...raisonnement, id: 'a b' }])],
    ['un id vide', body([{ ...raisonnement, id: '' }])],
    ['un id de 201 caractères', body([{ ...raisonnement, id: 'a'.repeat(201) }])],
    ['une date sans décalage', body([{ ...raisonnement, ts: '2026-11-12T10:00:00' }])],
    ['un texte vide', body([{ ...raisonnement, texte: '' }])],
    ['un texte de 20 001 caractères', body([{ ...raisonnement, texte: 'a'.repeat(20_001) }])],
    ['un outil de 61 caractères', body([{ ...appel, outil: 'a'.repeat(61) }])],
    ['une cible de 201 caractères', body([{ ...appel, cible: 'a'.repeat(201) }])],
    ['aucun bloc', body([])],
    [
      `${COULISSES_BLOCS_MAX + 1} blocs`,
      body(Array.from({ length: COULISSES_BLOCS_MAX + 1 }, () => raisonnement)),
    ],
    ['un type qui n’est pas une session de code', body([raisonnement], { kind: 'claude_ai' })],
    ['un usage inconnu', body([raisonnement], { usages: ['tout'] })],
  ])('refuse %s', (_, value) => {
    expect(ok(value)).toBe(false);
  });
});
