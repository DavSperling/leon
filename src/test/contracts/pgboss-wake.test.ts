import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

// Avec l'écoute de Postgres (pipeline/queue.ts), une boucle de pg-boss attend 30 s après chaque job, sauf si un
// envoi la réveille : chaque `boss.work` passe donc son handler par `wakeQueueAfter`, et chaque file naît par
// `ensureQueue` (qui pose `notify`). Un oubli ne casse rien, la file devient seulement lente : ce test est le seul
// à le voir.

const QUEUE_FILE = 'src/server/pipeline/queue.ts';
const WORK = /\.work\(/g;
const WAKE = /\bwakeQueueAfter\(/g;
const CREATE_QUEUE = /\.createQueue\(/g;

// shortcut: un `//` dans une chaîne masquerait la fin de sa ligne ; sans effet sur ces comptes, à revoir si une
// chaîne contenant `//` précède un de ces appels sur la même ligne.
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const count = (text: string, pattern: RegExp): number =>
  [...withoutComments(text).matchAll(pattern)].length;

const sources = () => productionSources('src/**/*.{ts,tsx}');

describe('files de pg-boss', () => {
  it('en trouve au moins un `.work(` : la lecture des sources fonctionne', () => {
    expect(sources().some(({ text }) => count(text, WORK) > 0)).toBe(true);
  });

  it('enveloppe chaque `.work(` avec wakeQueueAfter, autant de fois que d’appels', () => {
    const faulty = sources().flatMap(({ path, text }) => {
      const works = count(text, WORK);
      const wakes = count(text, WAKE);
      return works > 0 && wakes !== works
        ? [`${path} : ${works} appel(s) de .work(, ${wakes} de wakeQueueAfter(`]
        : [];
    });

    expect(
      faulty,
      'Un handler de boss.work sans wakeQueueAfter : sa boucle attendrait 30 s après chaque job, et le reste de la file ne partirait plus qu’à quelques jobs toutes les 30 s.',
    ).toEqual([]);
  });

  it('ne crée aucune file hors de pipeline/queue.ts', () => {
    const direct = sources()
      .filter(({ path, text }) => path !== QUEUE_FILE && count(text, CREATE_QUEUE) > 0)
      .map(({ path }) => path);

    expect(
      direct,
      'Un createQueue direct : la file naîtrait sans notify et ne réveillerait pas ses lecteurs. Passer par ensureQueue (pipeline/queue.ts).',
    ).toEqual([]);
  });
});
