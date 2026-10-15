import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FaitProduit } from './collect';
import {
  comparerPassages,
  coutParTourPrecedent,
  detaillerNotes,
  enregistrerPassage,
  modelesCompacts,
  type Passage,
  passagePrecedent,
} from './history';
import type { Notes } from './score';

const notes = (surcharge: Partial<Notes> = {}): Notes => ({
  attendus: 200,
  retrouves: 150,
  rappel: 0.75,
  produits: 180,
  horsJeu: 2,
  apparies: 160,
  precision: 0.889,
  fauxFaits: 5,
  doublonsFaits: 3,
  redits: 4,
  reditsRecrees: 1,
  tourCorrect: { ok: 150, sur: 160 },
  ficheCorrecte: { ok: 140, sur: 160 },
  typeCorrect: { ok: 150, sur: 160 },
  fichesDispersees: 2,
  remplacements: { trouves: 3, attendus: 5 },
  conflits: { trouves: 2, attendus: 4 },
  sensibles: { marques: 6, attendus: 8, retrouves: 7 },
  sensiblesProduitsPartages: 0,
  fuitesSensibles: 1,
  surSignales: 2,
  secretsFuites: 0,
  parConversation: [],
  ...surcharge,
});

const passage = (id: string, coutTotal: number, surcharge: Partial<Passage> = {}): Passage => ({
  id,
  date: '2026-10-16T10:00:00.000Z',
  label: 'référence',
  commit: 'abcdef1234567',
  jeu: 'complet',
  modeles: {
    triage: 'claude-haiku-5-5',
    extraction: 'claude-sonnet-5-5',
    placement: 'claude-haiku-5-5',
    juge: 'claude-haiku-5-5',
  },
  tours: 600,
  dureeMinutes: 42,
  runs: { total: 70, done: 69, failed: 1, enCours: 0, fin: null },
  usage: {
    triage: {
      appels: 70,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.05,
    },
    extraction: {
      appels: 60,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: coutTotal - 0.1,
    },
    placement: {
      appels: 50,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.05,
    },
  },
  coutJuge: 0.03,
  jugeErreurs: [],
  appariements: {},
  notes: detaillerNotes(notes(), [], new Map()),
  ...surcharge,
});

describe('historique', () => {
  it('crée le tableau, ajoute une ligne par passage et écrit le détail en JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'historique-'));
    await enregistrerPassage(passage('2026-10-16-1000-reference', 1.3), dir);
    await enregistrerPassage(passage('2026-10-16-1400-haiku', 0.6), dir);

    const md = await readFile(join(dir, 'historique.md'), 'utf8');
    expect(md.match(/^\| 2026-10-16 /gm)).toHaveLength(2);
    expect(md).toContain('| 1,30 $ |');
    expect(md).toContain('| 75 % |');
    expect(md).toContain('triage haiku-5-5 · extraction sonnet-5-5 · rangement haiku-5-5');
    const json = JSON.parse(
      await readFile(join(dir, 'passages/2026-10-16-1000-reference.json'), 'utf8'),
    );
    expect(json.label).toBe('référence');
  });

  it('échappe le | et réduit les espaces multiples dans le libellé', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'historique-'));
    await enregistrerPassage(
      passage('2026-10-16-1000-reference', 1.3, { label: 'a | b   c' }),
      dir,
    );
    const md = await readFile(join(dir, 'historique.md'), 'utf8');
    expect(md).toContain('a \\| b c');
  });

  it('marque les erreurs de juge dans la ligne d historique', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'historique-'));
    await enregistrerPassage(
      passage('2026-10-16-1000-reference', 1.3, { jugeErreurs: ['hugo/x', 'nora/y'] }),
      dir,
    );
    const md = await readFile(join(dir, 'historique.md'), 'utf8');
    expect(md).toContain('| 0 | 1 | 2 | 2 | 42 min |');
  });

  it('donne le coût par tour du dernier passage complet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'historique-'));
    expect(await coutParTourPrecedent(dir)).toBeNull();
    await enregistrerPassage(passage('2026-10-16-1000-reference', 1.2), dir);
    expect(await coutParTourPrecedent(dir)).toBeCloseTo(0.002);
  });
});

const produit = (id: string, statement: string): FaitProduit => ({
  id,
  sourceExternalId: 'src',
  turnExternalId: `t-${id}`,
  statement,
  value: null,
  quote: '',
  status: 'active',
  sensitivity: 'normal',
  partage: true,
  ficheId: 'fiche',
  ficheTitre: 'Fiche Dupont',
  typeFiche: 'client',
  supersededBy: null,
});

describe('detaillerNotes', () => {
  it('ajoute le texte des faits en trop et des faux faits à chaque conversation', () => {
    const detail = detaillerNotes(
      notes({
        parConversation: [
          {
            cle: 'hugo/x',
            attendus: 2,
            retrouves: 1,
            produits: 3,
            manques: ['F2'],
            enTrop: ['p2'],
            fauxFaits: ['p3'],
          },
        ],
      }),
      [produit('p1', 'Vrai'), produit('p2', 'En trop'), produit('p3', 'Faux')],
      new Map([
        ['p1', 'F1'],
        ['p2', null],
        ['p3', 'N1'],
      ]),
    );
    const c = detail.parConversation[0];
    expect(c?.faitsEnTrop).toEqual([
      {
        statement: 'En trop',
        turnExternalId: 't-p2',
        ficheTitre: 'Fiche Dupont',
        correspond: null,
      },
    ]);
    expect(c?.fauxFaitsDetail).toEqual([
      { statement: 'Faux', turnExternalId: 't-p3', ficheTitre: 'Fiche Dupont', correspond: 'N1' },
    ]);
  });
});

describe('comparaison avec le passage précédent', () => {
  it('retrouve le passage précédent du même jeu, pas un mini ni le passage courant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'historique-'));
    expect(await passagePrecedent('complet', '2026-10-16-1000-reference', dir)).toBeNull();
    await enregistrerPassage(passage('2026-10-15-1000-ancien', 1.3), dir);
    await enregistrerPassage(passage('2026-10-15-1200-mini', 0.2, { jeu: 'mini' }), dir);
    await enregistrerPassage(passage('2026-10-16-1000-reference', 1.0), dir);
    const prec = await passagePrecedent('complet', '2026-10-16-1000-reference', dir);
    expect(prec?.id).toBe('2026-10-15-1000-ancien');
  });

  it('affiche rappel, précision, faux faits et coût pipeline : précédent → actuel', () => {
    const lignes = comparerPassages(
      passage('a', 1.3),
      passage('b', 0.6, {
        notes: detaillerNotes(notes({ rappel: 0.8, precision: null, fauxFaits: 2 }), [], new Map()),
      }),
    );
    expect(lignes.join('\n')).toContain('Rappel : 75 % → 80 %');
    expect(lignes.join('\n')).toContain('Précision : 89 % → n/d');
    expect(lignes.join('\n')).toContain('Faux faits : 5 → 2');
    expect(lignes.join('\n')).toContain('Coût pipeline : 1,30 $ → 0,60 $');
  });
});

describe('modelesCompacts', () => {
  it('abrège les modèles des passages avant le choix du fournisseur', () => {
    expect(
      modelesCompacts({
        triage: 'claude-haiku-5-5',
        extraction: 'claude-sonnet-5-5',
        placement: 'claude-haiku-5-5',
        juge: 'claude-haiku-5-5',
      }),
    ).toBe('triage haiku-5-5 · extraction sonnet-5-5 · rangement haiku-5-5');
  });

  it('garde le fournisseur des modèles servis par OpenRouter', () => {
    expect(
      modelesCompacts({
        triage: 'anthropic:claude-haiku-5-5',
        extraction: 'openrouter:mistralai/mistral-large-4-0',
        placement: 'openrouter:openai/gpt-5.4-mini',
        juge: 'anthropic:claude-haiku-5-5',
      }),
    ).toBe(
      'triage haiku-5-5 · extraction mistralai/mistral-large-4-0 · rangement openai/gpt-5.4-mini',
    );
  });
});
