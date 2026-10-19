import { describe, expect, it } from 'vitest';
import { buildActiveChips, buildMenus } from './search-filters';

const NOW = new Date('2026-10-19T10:00:00Z');

const chips = (q: string) =>
  buildActiveChips(q, NOW).map(({ label, recognized, removeHref }) => ({
    label,
    recognized,
    removeHref,
  }));

describe('buildActiveChips', () => {
  it('ne rend rien pour une requête sans filtre', () => {
    expect(chips('budget')).toEqual([]);
    expect(chips('')).toEqual([]);
  });

  it('nomme chaque filtre en français et donne l’adresse de la recherche sans lui', () => {
    expect(chips('call de:julie outil:github type:réunion depuis:7j')).toEqual([
      {
        label: 'Personne : julie',
        recognized: true,
        removeHref: '/?q=call+outil%3Agithub+type%3Ar%C3%A9union+depuis%3A7j',
      },
      {
        label: 'Outil : GitHub',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+type%3Ar%C3%A9union+depuis%3A7j',
      },
      {
        label: 'Type : Réunion',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+outil%3Agithub+depuis%3A7j',
      },
      {
        label: 'Depuis : 7 jours',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+outil%3Agithub+type%3Ar%C3%A9union',
      },
    ]);
  });

  it('écrit la durée et la date comme on les lit', () => {
    expect(chips('depuis:1j').map((c) => c.label)).toEqual(['Depuis : 1 jour']);
    expect(chips('depuis:2s').map((c) => c.label)).toEqual(['Depuis : 2 semaines']);
    expect(chips('depuis:3m').map((c) => c.label)).toEqual(['Depuis : 3 mois']);
    expect(chips('depuis:2026-09-01').map((c) => c.label)).toEqual(['Depuis : 1 sept. 2026']);
    expect(chips('avant:2026-10-01').map((c) => c.label)).toEqual(['Avant : 1 oct. 2026']);
  });

  it('retire le dernier filtre sans laisser une requête vide en adresse', () => {
    expect(chips('outil:github')[0]?.removeHref).toBe('/');
  });

  it('garde un filtre inconnu, marqué comme non reconnu, pour qu’on puisse le retirer', () => {
    expect(chips('outil:inconnu type:truc depuis:bientot avant:demain x')).toEqual([
      {
        label: 'Outil : inconnu',
        recognized: false,
        removeHref: '/?q=type%3Atruc+depuis%3Abientot+avant%3Ademain+x',
      },
      {
        label: 'Type : truc',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+depuis%3Abientot+avant%3Ademain+x',
      },
      {
        label: 'Depuis : bientot',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+type%3Atruc+avant%3Ademain+x',
      },
      {
        label: 'Avant : demain',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+type%3Atruc+depuis%3Abientot+x',
      },
    ]);
  });

  it('reconnaît un outil par son libellé comme par son identifiant', () => {
    expect(chips('outil:"Claude Code"')[0]).toMatchObject({
      label: 'Outil : Claude Code',
      recognized: true,
    });
    expect(chips('outil:claude_code')[0]).toMatchObject({ label: 'Outil : Claude Code' });
  });
});

describe('buildMenus', () => {
  const menu = (q: string, name: string) => buildMenus(q).find((m) => m.name === name);

  it('propose les outils, les types et les périodes', () => {
    expect(buildMenus('x').map((m) => m.name)).toEqual(['outil', 'type', 'periode']);
  });

  it('écrit le filtre en tête de la requête, sans perdre le reste', () => {
    const github = menu('budget', 'outil')?.options.find((o) => o.label === 'GitHub');

    expect(github).toEqual({
      label: 'GitHub',
      active: false,
      href: '/?q=outil%3Agithub+budget',
    });
  });

  it('coche ce qui est dans la requête, et propose de le retirer', () => {
    const github = menu('outil:github budget', 'outil')?.options.find((o) => o.label === 'GitHub');

    expect(github).toMatchObject({ active: true, href: '/?q=budget' });
  });

  it('remplace la période au lieu d’en ajouter une', () => {
    const month = menu('depuis:7j x', 'periode')?.options.find(
      (o) => o.label === '30 derniers jours',
    );

    expect(month).toMatchObject({ active: false, href: '/?q=depuis%3A30j+x' });
  });
});
