import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { ComputersSection } from './computers';
import type { Token } from './tokens';

// Les actions importent Better Auth : seul le dessin de la section se teste ici.
vi.mock('@/app/(app)/reglages/actions', () => ({ revokeTokenAction: vi.fn() }));

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const MACBOOK: Token = {
  id: 'c1',
  name: 'MacBook',
  hint: 'abcd',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  lastUsedAt: new Date('2026-11-02T10:00:00Z'),
};
const NEVER_USED = { ...MACBOOK, id: 'c2', name: 'Linux-bureau', lastUsedAt: null };

const render = (
  props: { computers: Token[]; command: string | null },
  locale: 'en' | 'fr' = 'en',
) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(ComputersSection, props),
    }),
  );

// S14 : la section « Ordinateurs connectés » de Réglages, ancre #ordinateurs (le lien « Ce qui part » de l'onboarding).
describe('ComputersSection', () => {
  it('porte l’ancre #ordinateurs et montre la commande à copier', () => {
    const html = render({ computers: [], command: COMMAND });

    expect(html).toMatch(/<section id="ordinateurs"/);
    expect(html).toContain('Connected computers');
    expect(html).toContain(`>${COMMAND}</code>`);
  });

  it('liste chaque ordinateur avec sa création, sa dernière utilisation et Revoke', () => {
    const html = render({ computers: [MACBOOK, NEVER_USED], command: COMMAND });

    expect(html).toContain('MacBook');
    expect(html).toContain('Linux-bureau');
    expect(html).toContain('created');
    expect(html).toContain('never used');
    expect(html.match(/data-revoke="/g)).toHaveLength(2);
    expect(html).toContain('>Revoke<');
    expect(html).not.toContain('No computer connected yet');
  });

  it('sans ordinateur, le dit et garde la commande', () => {
    const html = render({ computers: [], command: COMMAND });

    expect(html).toContain('No computer connected yet.');
    expect(html).not.toContain('data-revoke');
    expect(html).toContain(COMMAND);
  });

  it('sans commande (adresse du serveur refusée), ne montre rien de faux à copier mais garde la liste', () => {
    const html = render({ computers: [MACBOOK], command: null });

    expect(html).not.toContain('curl');
    expect(html).toContain('MacBook');
  });

  it('se lit en français', () => {
    const html = render({ computers: [MACBOOK], command: COMMAND }, 'fr');

    expect(html).toContain('Ordinateurs connectés');
    expect(html).toContain('Révoquer');
  });
});
