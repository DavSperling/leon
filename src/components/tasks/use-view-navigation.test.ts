import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, parseViewParams } from '@/lib/tasks/view-config';
import { listHref } from './use-view-navigation';

const BASE = DEFAULT_VIEW_CONFIG;
const hrefParams = (href: string) => new URL(href, 'http://leon.test').searchParams;

describe('listHref', () => {
  it('écrit /taches sans paramètre quand la configuration est celle de la base', () => {
    expect(listHref(BASE, BASE, new URLSearchParams())).toBe('/taches');
  });

  it('n’écrit que les écarts à la base, que la page relit à l’identique', () => {
    const config = { ...BASE, groupBy: 'priority', layout: 'board' } as const;
    const href = listHref(config, BASE, new URLSearchParams());
    expect(href).toBe('/taches?disposition=tableau&groupe=priorite');
    expect(parseViewParams(hrefParams(href), BASE)).toEqual(config);
  });

  it('garde la vue ouverte et l’onglet, et écarte les réglages devenus inutiles', () => {
    const current = new URLSearchParams('vue=abc&onglet=activite&groupe=priorite&bruit=1');
    expect(listHref(BASE, BASE, current)).toBe('/taches?vue=abc&onglet=activite');
  });

  it('compare à la base de la vue ouverte, pas au défaut de Leon', () => {
    const view = { ...BASE, groupBy: 'assignee' } as const;
    expect(listHref(view, view, new URLSearchParams('vue=abc'))).toBe('/taches?vue=abc');
    expect(listHref(BASE, view, new URLSearchParams('vue=abc'))).toBe(
      '/taches?groupe=statut&vue=abc',
    );
  });
});
