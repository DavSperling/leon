import { describe, expect, it } from 'vitest';
import { cleanListQuery, projectHref, viewHref } from '@/lib/tasks/task-links';
import { DEFAULT_VIEW_CONFIG, parseViewParams, toViewParams } from '@/lib/tasks/view-config';
import { pageRoutes } from '@/test/contracts/files';
import { TABS } from './my-tasks-tabs';
import { currentNavKey, FIXED_ITEMS } from './task-nav';

const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const paramsOf = (href: string) => new URL(href, 'http://leon.test').searchParams;
const pathOf = (href: string) => new URL(href, 'http://leon.test').pathname;

describe('navigation des tâches', () => {
  it('marque chaque entrée fixe comme courante sur son propre lien', () => {
    for (const { key, href } of FIXED_ITEMS) {
      expect(currentNavKey(pathOf(href), paramsOf(href))).toBe(key);
    }
  });

  it('marque le projet et la vue de leur lien', () => {
    expect(currentNavKey('/taches', paramsOf(projectHref(ID)))).toBe(`project:${ID}`);
    expect(currentNavKey('/taches', paramsOf(viewHref(ID)))).toBe(`view:${ID}`);
  });

  it('passe de « Toutes » à « Mes tâches » avec les onglets assignées, créées, activité', () => {
    expect(currentNavKey('/taches', new URLSearchParams())).toBe('all');
    expect(currentNavKey('/taches', new URLSearchParams('statut=tous&groupe=priorite'))).toBe(
      'all',
    );
    expect(currentNavKey('/taches', new URLSearchParams('assigne=moi'))).toBe('mine');
    expect(currentNavKey('/taches', new URLSearchParams('createur=moi'))).toBe('mine');
    expect(currentNavKey('/taches', new URLSearchParams('onglet=activite'))).toBe('mine');
  });

  it('donne la vue enregistrée avant le projet, et le projet avant « Mes tâches »', () => {
    expect(currentNavKey('/taches', new URLSearchParams(`vue=${ID}&projet=${ID}`))).toBe(
      `view:${ID}`,
    );
    expect(currentNavKey('/taches', new URLSearchParams(`projet=${ID}&assigne=moi`))).toBe(
      `project:${ID}`,
    );
  });

  it('relit un identifiant écrit en majuscules', () => {
    expect(currentNavKey('/taches', new URLSearchParams(`projet=${ID.toUpperCase()}`))).toBe(
      `project:${ID}`,
    );
  });

  it('ignore un identifiant invalide, comme la liste', () => {
    expect(currentNavKey('/taches', new URLSearchParams('projet=zzz'))).toBe('all');
    expect(currentNavKey('/taches', new URLSearchParams('vue=zzz'))).toBe('all');
    expect(currentNavKey('/taches', new URLSearchParams(`vue=zzz&projet=${ID}`))).toBe(
      `project:${ID}`,
    );
    expect(currentNavKey('/taches', new URLSearchParams('projet=zzz&assigne=moi'))).toBe('mine');
  });

  it('ne marque rien hors de la liste', () => {
    expect(currentNavKey('/taches/LEO-12', new URLSearchParams())).toBeNull();
    expect(currentNavKey('/taches/reglages', new URLSearchParams())).toBeNull();
    expect(currentNavKey('/', new URLSearchParams())).toBeNull();
  });

  it('écrit des liens que la liste comprend (réglages de vue de T01)', () => {
    const mine = FIXED_ITEMS.find((item) => item.key === 'mine');
    const base = DEFAULT_VIEW_CONFIG;
    expect(parseViewParams(paramsOf(mine?.href ?? ''), base).filters.assignee).toBe('me');
    expect(parseViewParams(paramsOf(projectHref(ID)), base).filters.projectId).toBe(ID);
  });

  it('relit les paramètres que la liste écrit', () => {
    const base = DEFAULT_VIEW_CONFIG;
    const written = (filters: Partial<typeof base.filters>) =>
      toViewParams({ ...base, filters: { ...base.filters, ...filters } }, base);
    expect(currentNavKey('/taches', written({ assignee: 'me' }))).toBe('mine');
    expect(currentNavKey('/taches', written({ creator: 'me' }))).toBe('mine');
    expect(currentNavKey('/taches', written({ projectId: ID }))).toBe(`project:${ID}`);
  });

  it('mène chaque lien de la navigation à une page qui existe', () => {
    const hrefs = [...FIXED_ITEMS.map((item) => item.href), projectHref(ID), viewHref(ID)];
    for (const href of hrefs) expect(pageRoutes()).toContain(pathOf(href));
  });

  it('écrit des adresses que la page d’une tâche garde en `retour` sans en perdre', () => {
    const hrefs = [
      ...FIXED_ITEMS.map((item) => item.href),
      ...TABS.map((tab) => tab.href),
      projectHref(ID),
      viewHref(ID),
    ];
    for (const href of hrefs) {
      const query = paramsOf(href).toString();
      expect(cleanListQuery(query), href).toBe(query);
    }
  });
});
