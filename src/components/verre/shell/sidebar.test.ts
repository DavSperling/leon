import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import { TooltipProvider } from '../ui/menu';
import { NAV, sectionOf } from './nav';
import { Sidebar, type SidebarProps } from './sidebar';

// La barre latérale rendue côté serveur (pas de DOM ici) : ce qu'elle doit toujours porter, et ce qu'elle ne montre plus.

const path = vi.hoisted(() => ({ current: '/connexions' }));
vi.mock('next/navigation', () => ({
  usePathname: () => path.current,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode }) => createElement('a', props, children),
}));
// Les actions du serveur ne sont pas appelées au rendu : leurs modules (base, session) ne se chargent pas ici.
vi.mock('@/app/(app)/actions', () => ({ signOutAction: vi.fn() }));
vi.mock('@/app/(app)/discussions/actions', () => ({ deleteDiscussionAction: vi.fn() }));

const h = createElement as unknown as (
  type: unknown,
  props?: object | null,
  ...children: ReactNode[]
) => ReactElement;
const VIEWER: SidebarProps = {
  organizationName: 'Atelier Lebrun',
  userName: 'Claire Lebrun',
  userEmail: 'claire@example.com',
  recents: [],
  reconnect: [],
  stale: [],
};
const html = (props: Partial<SidebarProps> = {}) =>
  renderToStaticMarkup(
    h(
      NextIntlClientProvider,
      { locale: 'en', messages: en },
      h(TooltipProvider, null, h(Sidebar, { ...VIEWER, ...props })),
    ),
  );

beforeEach(() => {
  path.current = '/connexions';
});

describe('NAV', () => {
  it('commence par l’accueil, à « / », et reconnaît la section d’une discussion ouverte', () => {
    expect(NAV[0]).toMatchObject({ href: '/', labelKey: 'home' });
    expect(sectionOf('/discussions/abc')?.href).toBe('/discussions');
    expect(sectionOf('/')?.href).toBe('/');
    expect(sectionOf('/kit')).toBeUndefined();
  });
});

describe('Sidebar', () => {
  it('garde ses repères (#barre-laterale, data-rail, le bouton de repli) et rend les six sections, la courante marquée', () => {
    const out = html();
    expect(out).toMatch(/<aside id="barre-laterale" aria-label="Sidebar" data-rail="deplie"/);
    expect(out).toContain('aria-controls="barre-laterale"');
    expect(out).toContain('aria-keyshortcuts="["');
    for (const { href } of NAV) expect(out).toContain(`href="${href}"`);
    expect(out).toMatch(/<a href="\/connexions" aria-current="page"/);
    expect(out.match(/aria-current=/g)).toHaveLength(1);
  });

  it('finit par une seule ligne d’identité : le rond, le nom, l’espace ; ni tuile d’espace ni nombre de membres', () => {
    const out = html();
    expect(out).toContain('aria-label="Account menu: Atelier Lebrun, Claire Lebrun"');
    expect(out).toContain('rounded-full');
    expect(out).toContain('>CL<');
    expect(out).toContain('Atelier Lebrun');
    expect(out).not.toContain('claire@example.com'); // l'adresse est dans le menu, pas sur la ligne
    expect(out).not.toMatch(/\d+ (people|person)/);
  });

  it('montre la photo du compte quand il en a une', () => {
    expect(html({ userImage: 'https://example.com/claire.png' })).toContain(
      'src="https://example.com/claire.png"',
    );
  });

  it('ne dit rien tant que tout va bien : ni drapeau, ni alerte, ni « Recent »', () => {
    const out = html();
    expect(out).not.toContain('class="tag');
    expect(out).not.toContain('needs reconnecting');
    expect(out).not.toContain('Memory out of date');
    expect(out).not.toContain('Recent');
  });

  it('nomme l’outil à reconnecter et ouvre son écran', () => {
    const out = html({ reconnect: ['gmail'] });
    expect(out).toMatch(/class="tag c4[^"]*"><span aria-hidden="true">1<\/span>/);
    expect(out).toContain('href="/connexions?outil=gmail"');
    expect(out).toContain('Gmail needs reconnecting');
  });

  it('plusieurs outils à reconnecter : les compte, sans en nommer un, et ouvre Connexions', () => {
    const out = html({ reconnect: ['gmail', 'linear'] });
    expect(out).toMatch(/class="tag c4[^"]*"><span aria-hidden="true">2<\/span>/);
    expect(out).toContain('2 tools to reconnect');
    expect(out).toContain('2 tools need reconnecting');
    expect(out).toMatch(/<a href="\/connexions" class="[^"]*text-destructive/);
    expect(out).not.toContain('Gmail needs reconnecting');
  });

  it('garde l’alerte « mémoire en retard », avec ses canaux, vers les Réglages', () => {
    const out = html({
      stale: [
        { kind: 'claude_code', kindLabel: 'Claude Code', lastCaptureAt: new Date(0) },
        { kind: 'codex', kindLabel: 'Codex', lastCaptureAt: new Date(0) },
      ],
    });
    expect(out).toContain('Memory out of date · Claude Code, Codex');
    expect(out).toMatch(/<a href="\/reglages"[^>]*>(?:(?!<\/a>).)*Memory out of date/);
  });

  it('liste les discussions récentes, marque celle qui est ouverte, et donne à chacune ses trois points', () => {
    path.current = '/discussions/d2';
    const out = html({
      recents: [
        { id: 'd1', title: 'Contrat ACME' },
        { id: 'd2', title: 'Budget Nordia' },
      ],
    });
    expect(out).toContain('Recent');
    expect(out).toContain('<a href="/discussions/d1"');
    expect(out).toMatch(/<a href="\/discussions\/d2" aria-current="true"/);
    // la section Discussions reste marquée elle aussi
    expect(out).toMatch(/<a href="\/discussions" aria-current="page"/);
    expect(out).toContain('aria-label="Options for “Contrat ACME”"');
    expect(out).toContain('aria-label="Options for “Budget Nordia”"');
  });
});
