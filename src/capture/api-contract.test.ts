import { describe, expect, it } from 'vitest';
import {
  ChercherRequestSchema,
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
