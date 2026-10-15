import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coutParTourPrecedent, enregistrerPassage, type Passage } from './history';
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
  notes: notes(),
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
    const json = JSON.parse(
      await readFile(join(dir, 'passages/2026-10-16-1000-reference.json'), 'utf8'),
    );
    expect(json.label).toBe('référence');
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
