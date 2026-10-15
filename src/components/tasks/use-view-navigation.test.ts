import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, parseViewParams } from '@/lib/tasks/view-config';
import { pageRoutes, readText } from '@/test/contracts/files';
import { viewHref } from './task-nav';
import { listHref, PAGE_PARAMS } from './use-view-navigation';

const BASE = DEFAULT_VIEW_CONFIG;
const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
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

  it('mène à une page qui existe', () => {
    const config = { ...BASE, groupBy: 'priority' } as const;
    for (const href of [
      listHref(BASE, BASE, new URLSearchParams()),
      listHref(config, BASE, new URLSearchParams()),
    ]) {
      expect(pageRoutes()).toContain(new URL(href, 'http://leon.test').pathname);
    }
  });

  it('garde le paramètre qui ouvre une vue, celui que la page lit', () => {
    const [openParam] = [...hrefParams(viewHref(ID)).keys()];
    expect(PAGE_PARAMS).toContain(openParam);
    expect(readText('src/app/(taches)/taches/page.tsx')).toContain(`params.${openParam}`);
  });
});
