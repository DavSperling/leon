import { describe, expect, it } from 'vitest';
import { pageRoutes, readText } from '@/test/contracts/files';
import {
  backHref,
  cleanListQuery,
  listQueryOf,
  PAGE_PARAMS,
  RETURN_PARAM,
  taskHref,
} from './task-links';
import { DEFAULT_VIEW_CONFIG, parseViewParams } from './view-config';

const VIEW_ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const ORIGIN = 'http://leon.test';

// Ce qu'un visiteur malveillant peut écrire dans `retour`.
const HOSTILE = [
  '//exemple.com',
  '/autre',
  '/taches',
  'javascript:alert(1)',
  'https://exemple.com/taches',
  '\\\\exemple.com',
  '@exemple.com',
  '%2F%2Fexemple.com',
  '../..',
  'groupe=priorite&redirect=//exemple.com',
];

describe('cleanListQuery', () => {
  it.each(HOSTILE)('ne garde rien de %j', (raw) => {
    expect(cleanListQuery(raw)).not.toMatch(/exemple|javascript|autre|redirect|\.\./);
  });

  it('rend une requête vide pour une valeur absente ou vide', () => {
    expect(cleanListQuery(undefined)).toBe('');
    expect(cleanListQuery(null)).toBe('');
    expect(cleanListQuery('')).toBe('');
  });

  it('garde les réglages valides, la vue et l’onglet, et accepte un « ? » en tête', () => {
    expect(
      cleanListQuery(`?groupe=priorite&disposition=tableau&vue=${VIEW_ID}&onglet=activite`),
    ).toBe(`disposition=tableau&groupe=priorite&vue=${VIEW_ID}&onglet=activite`);
  });

  it('écarte la vue qui n’est pas un identifiant, l’onglet inconnu et les valeurs invalides', () => {
    expect(cleanListQuery('vue=/autre&onglet=//exemple.com&groupe=zzz&tri=hasard')).toBe('');
  });

  it('garde une valeur égale au défaut de Leon, que le défaut d’équipe peut contredire', () => {
    expect(cleanListQuery('groupe=statut')).toBe('groupe=statut');
  });

  it('est idempotente', () => {
    const once = cleanListQuery(`disposition=tableau&assigne=moi&vue=${VIEW_ID}&bruit=1`);
    expect(cleanListQuery(once)).toBe(once);
  });

  it('donne à la liste les mêmes réglages que la requête d’origine', () => {
    const raw = 'groupe=priorite&props=&statut=tous&inconnu=1';
    expect(parseViewParams(new URLSearchParams(cleanListQuery(raw)), DEFAULT_VIEW_CONFIG)).toEqual(
      parseViewParams(new URLSearchParams(raw), DEFAULT_VIEW_CONFIG),
    );
  });
});

describe('backHref', () => {
  it('mène à la liste sans paramètre quand il n’y a rien à garder', () => {
    expect(backHref(undefined)).toBe('/taches');
    expect(backHref('//exemple.com')).toBe('/taches');
    expect(backHref('/autre')).toBe('/taches');
    expect(backHref('javascript:alert(1)')).toBe('/taches');
  });

  it('mène à la liste d’où l’on vient', () => {
    expect(backHref('groupe=priorite&assigne=moi')).toBe('/taches?groupe=priorite&assigne=moi');
  });

  it.each(HOSTILE)('reste sur ce site, sous /taches, pour %j', (raw) => {
    const url = new URL(backHref(raw), ORIGIN);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/taches');
  });

  it('mène à une page qui existe', () => {
    expect(pageRoutes()).toContain(new URL(backHref('groupe=priorite'), ORIGIN).pathname);
  });
});

describe('taskHref', () => {
  it('n’ajoute rien sans requête de liste', () => {
    expect(taskHref('LEO-12', '')).toBe('/taches/LEO-12');
  });

  it('porte la requête de la liste dans `retour`, que la page relit à l’identique', () => {
    const query = 'disposition=tableau&q=a%26b%3Dc';
    const url = new URL(taskHref('LEO-12', query), ORIGIN);
    expect(url.pathname).toBe('/taches/LEO-12');
    expect(url.searchParams.get(RETURN_PARAM)).toBe(query);
    expect(url.searchParams.size).toBe(1);
  });

  it('aller-retour : la liste d’où l’on vient est celle où l’on revient', () => {
    const query = cleanListQuery(`groupe=priorite&q=%C3%A9t%C3%A9+%26+co&vue=${VIEW_ID}`);
    const returned = new URL(taskHref('LEO-12', query), ORIGIN).searchParams.get(RETURN_PARAM);
    expect(backHref(returned)).toBe(`/taches?${query}`);
  });

  it('mène à une page qui existe', () => {
    const path = new URL(taskHref('LEO-12', 'groupe=priorite'), ORIGIN).pathname;
    expect(pageRoutes()).toContain(path.replace('LEO-12', '[ref]'));
  });
});

describe('listQueryOf', () => {
  it('lit la requête de la liste affichée', () => {
    expect(listQueryOf(new URLSearchParams('groupe=priorite&assigne=moi'))).toBe(
      'groupe=priorite&assigne=moi',
    );
    expect(listQueryOf(new URLSearchParams())).toBe('');
  });

  it('sur la page d’une tâche, lit la liste d’origine dans `retour`, sans l’emballer une seconde fois', () => {
    const surLaTache = new URLSearchParams({ [RETURN_PARAM]: 'groupe=priorite' });
    const href = taskHref('LEO-13', listQueryOf(surLaTache));
    const returned = new URL(href, ORIGIN).searchParams.get(RETURN_PARAM);
    expect(backHref(returned)).toBe('/taches?groupe=priorite');
  });
});

describe('paramètres de la page de liste', () => {
  it('la liste lit chacun de ceux que le retour garde', () => {
    const page = readText('src/app/(taches)/taches/page.tsx');
    expect(PAGE_PARAMS).toContain('vue');
    expect(PAGE_PARAMS).toContain('onglet');
    expect(page).toContain('params.vue');
    expect(page).toContain('params.onglet');
  });

  it('la page d’une tâche lit le paramètre que taskHref écrit, et le nettoie avant de s’en servir', () => {
    const page = readText('src/app/(taches)/taches/[ref]/page.tsx');
    expect(page).toContain('RETURN_PARAM');
    expect(page).toContain('cleanListQuery(');
  });
});
