import { describe, expect, it } from 'vitest';
import type { FicheLine } from '@/server/portrait/fiche';
import {
  busyDays,
  busyHours,
  delayOf,
  formatHour,
  joinList,
  languageShares,
  linesOf,
  percent,
  weekdayName,
} from './fiche-view';

// Ce que l'écran « Ma fiche » calcule avant d'écrire une phrase : des plages et des jours plutôt que 24 nombres, un
// délai dans son unité, des parts en pour cent.

// 24 heures à zéro, sauf celles données.
const hours = (counts: Record<number, number>) =>
  Array.from({ length: 24 }, (_, hour) => counts[hour] ?? 0);

describe('busyHours : les plages où elle écrit le plus', () => {
  it('garde les heures qui comptent au moins la moitié de la plus chargée, recollées quand elles se suivent', () => {
    // 9 h à 12 h et 14 h à 16 h ; 13 h (2 mails) et 20 h (1 mail) sont loin de la plus chargée (10).
    const heures = hours({ 9: 6, 10: 10, 11: 5, 13: 2, 14: 8, 15: 7, 20: 1 });

    expect(busyHours(heures)).toEqual([
      [9, 12],
      [14, 16],
    ]);
  });

  it('une plage qui finit à minuit s’arrête à 24 ; sans aucun mail, aucune plage', () => {
    expect(busyHours(hours({ 22: 3, 23: 4 }))).toEqual([[22, 24]]);
    expect(busyHours(hours({}))).toEqual([]);
  });
});

describe('busyDays : les jours où elle écrit le plus', () => {
  it('rend les jours les plus chargés dans l’ordre de la semaine, lundi d’abord', () => {
    expect(busyDays([10, 4, 9, 5, 0, 0, 1])).toEqual([0, 2, 3]);
    expect(busyDays([0, 0, 0, 0, 0, 0, 0])).toEqual([]);
  });
});

describe('les heures, les jours et les listes en mots', () => {
  it('écrit une heure dans la langue de l’écran, et 24 comme minuit', () => {
    expect([0, 9, 12, 18, 24].map((hour) => formatHour(hour, 'fr'))).toEqual([
      '0 h',
      '9 h',
      '12 h',
      '18 h',
      '0 h',
    ]);
    expect([0, 9, 12, 18, 24].map((hour) => formatHour(hour, 'en'))).toEqual([
      '12 AM',
      '9 AM',
      '12 PM',
      '6 PM',
      '12 AM',
    ]);
  });

  it('nomme les jours, lundi d’abord, et joint une liste comme une phrase', () => {
    expect([0, 6].map((day) => weekdayName(day, 'fr'))).toEqual(['lundi', 'dimanche']);
    expect([0, 6].map((day) => weekdayName(day, 'en'))).toEqual(['Monday', 'Sunday']);
    expect(joinList(['lundi', 'mardi', 'jeudi'], 'fr')).toBe('lundi, mardi et jeudi');
    expect(joinList(['Monday', 'Tuesday', 'Thursday'], 'en')).toBe('Monday, Tuesday, and Thursday');
    expect(joinList(['lundi'], 'fr')).toBe('lundi');
  });
});

describe('delayOf : un délai dans l’unité où il se lit', () => {
  it('des minutes sous une heure, des heures sous deux jours, puis des jours', () => {
    expect(delayOf(0)).toEqual({ unit: 'minutes', n: 0 });
    expect(delayOf(45)).toEqual({ unit: 'minutes', n: 45 });
    expect(delayOf(60)).toEqual({ unit: 'hours', n: 1 });
    expect(delayOf(150)).toEqual({ unit: 'hours', n: 3 });
    expect(delayOf(47 * 60)).toEqual({ unit: 'hours', n: 47 });
    expect(delayOf(48 * 60)).toEqual({ unit: 'days', n: 2 });
    expect(delayOf(5 * 24 * 60 + 100)).toEqual({ unit: 'days', n: 5 });
  });
});

describe('les parts', () => {
  it('une part de 0 à 1 se lit en pour cent entiers', () => {
    expect([0, 0.07, 0.666, 1].map(percent)).toEqual([0, 7, 67, 100]);
  });

  it('les langues de ses mails, la plus fréquente d’abord, sans celles qui n’ont aucun mail', () => {
    expect(languageShares({ fr: 30, en: 60, autre: 0, inconnue: 10 })).toEqual([
      { langue: 'en', part: 60 },
      { langue: 'fr', part: 30 },
      { langue: 'inconnue', part: 10 },
    ]);
    expect(languageShares({ fr: 0, en: 0, autre: 0, inconnue: 0 })).toEqual([]);
  });
});

describe('linesOf : les lignes d’un genre', () => {
  it('ne rend que les lignes du genre demandé, dans leur ordre', () => {
    const line = (genre: FicheLine['genre'], cle: string, valeur: FicheLine['valeur']) => ({
      id: `${genre}-${cle}`,
      genre,
      cle,
      valeur,
      provenance: 'calcul' as const,
      mails: 3,
      corrigeeLe: null,
    });
    const fiche: FicheLine[] = [
      line('mots', 'tous', { mediane: 40 }),
      line('role', '', { texte: 'Commerciale.' }),
      line('mots', 'externe', { mediane: 80 }),
    ];

    expect(linesOf(fiche, 'mots').map((one) => [one.cle, one.valeur.mediane])).toEqual([
      ['tous', 40],
      ['externe', 80],
    ]);
    expect(linesOf(fiche, 'role').map((one) => one.valeur.texte)).toEqual(['Commerciale.']);
    expect(linesOf(fiche, 'tache')).toEqual([]);
  });
});
