import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { CodeToolsCard } from './code-tools-card';
import { toolStates } from './tools-model';
import { ToolsStep } from './tools-step';

// Le composant client importe les actions de Connexions, donc Better Auth : seul le dessin de l'étape se teste ici.
vi.mock('@/components/verre/connexions/tool-dialog', () => ({ ToolDialog: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const CARD = 'Your coding tools';

const item = (id: string, family: string) =>
  ({ id, label: id, family, available: true, privateRaw: false }) as never;
const CATALOG = [item('github', 'dev'), item('linear', 'projet'), item('slack', 'mails')];

const step = (recommended: string[], codeCommand: string | null) =>
  createElement(ToolsStep, {
    states: toolStates(CATALOG, [], recommended as never),
    viewerId: 'u1',
    now: new Date('2026-11-03T10:00:00Z'),
    canConnect: true,
    consentUrl: null,
    nextHref: '/bienvenue/collaborateurs',
    steps: ['about', 'tools', 'teammates'],
    notice: null,
    codeCommand,
  });

// React 19 remonte les <link rel="preload"> des images en tête du document : ils ne disent rien de l'ordre de l'écran.
const render = (element: ReactElement, locale: 'en' | 'fr' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: element,
    }),
  ).replaceAll(/<link rel="preload"[^>]*>/g, '');

describe('ToolsStep : Vos outils de code', () => {
  it('vient en tête, avant les familles d’outils, quand le service travaille dans un dépôt', () => {
    const html = render(step(['github', 'linear'], COMMAND));

    expect(html).toContain(COMMAND);
    expect(html.indexOf(CARD)).toBeGreaterThan(-1);
    expect(html.indexOf(CARD)).toBeLessThan(html.indexOf('<fieldset'));
  });

  it('vient à la fin, après les familles et avant Continuer, pour les autres services', () => {
    const html = render(step(['linear', 'slack'], COMMAND));

    expect(html.indexOf(CARD)).toBeGreaterThan(html.lastIndexOf('</fieldset>'));
    expect(html.indexOf(CARD)).toBeLessThan(html.indexOf('>Continue<'));
  });

  it('ne s’affiche pas sans commande : l’adresse du serveur est refusée, rien de faux à copier', () => {
    const html = render(step(['github'], null));

    expect(html).not.toContain(CARD);
    expect(html).not.toContain('/reglages#ordinateurs');
  });

  it('se lit en français', () => {
    expect(render(step(['github'], COMMAND), 'fr')).toContain('Vos outils de code');
  });

  // Seul le bloc s'ajoute : les cases cochées, les familles, l'aperçu et le bouton Continuer restent ce qu'ils étaient.
  it('ne change que par le bloc : cases cochées et bouton Continuer intacts, en tête comme à la fin', () => {
    for (const recommended of [['github', 'linear'], ['linear']]) {
      const without = render(step(recommended, null));
      const withCard = render(step(recommended, COMMAND));
      const card = render(createElement(CodeToolsCard, { command: COMMAND }));

      expect(withCard).toContain(card);
      expect(withCard.replace(card, '')).toBe(without);
      expect(without).toContain('aria-pressed="true"');
      expect(without).toContain('href="/bienvenue/collaborateurs"');
    }
  });
});
