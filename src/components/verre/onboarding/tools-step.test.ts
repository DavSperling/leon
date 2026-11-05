import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { CodeToolsCard } from './code-tools-card';
import { toolStates } from './tools-model';
import { ToolsStep, type ToolsStepProps } from './tools-step';

// Le composant client importe les actions de Connexions et de l'onboarding, donc Better Auth : seul le dessin de
// l'étape se teste ici. Le formulaire de connexion d'un outil est remplacé par un repère.
vi.mock('@/components/verre/connexions/tool-dialog', async () => {
  const { createElement } = await import('react');
  return {
    ToolDialog: () => null,
    AddConnection: ({ entry }: { entry: { id: string } }) =>
      createElement('div', { 'data-add': entry.id }),
  };
});
vi.mock('@/app/(onboarding)/bienvenue/actions', () => ({ chooseToolsAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const INSTRUCTIONS = `Install Leon: ${COMMAND}`;
const CARD = 'Your coding tools';

// Proposé : branchable en un clic. Linear et Slack ne le sont pas sur ce serveur.
const item = (id: string, family: string, ready: boolean) =>
  ({
    id,
    label: id,
    family,
    available: true,
    triedForReal: ready,
    oauthReady: ready,
    privateRaw: id === 'gmail',
  }) as never;
const CATALOG = [
  item('github', 'dev', true),
  item('gmail', 'mails', true),
  item('linear', 'projet', false),
  item('slack', 'mails', false),
];
const mine = (provider: string) =>
  ({
    provider,
    status: 'active',
    createdBy: { id: 'u1', name: 'Ana' },
    isCreator: true,
    creatorLeft: false,
  }) as never;

const step = (over: Partial<ToolsStepProps> & { recommended?: string[]; conns?: never[] } = {}) => {
  const { recommended = [], conns = [], ...props } = over;
  return createElement(ToolsStep, {
    states: toolStates(CATALOG, conns, recommended as never),
    viewerId: 'u1',
    now: new Date('2026-11-03T10:00:00Z'),
    canConnect: true,
    consentUrl: null,
    nextHref: '/bienvenue/collaborateurs',
    steps: ['about', 'tools', 'teammates'],
    notice: null,
    connecting: false,
    chosen: null,
    codeCommand: null,
    codeInstructions: null,
    ...props,
  });
};

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

const checkbox = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? null;

describe('ToolsStep : le choix', () => {
  it('ne propose à cocher que les outils prêts, les conseillés déjà cochés', () => {
    const html = render(step({ recommended: ['gmail', 'linear'] }));

    expect(checkbox(html, 'gmail')).toContain('checked');
    expect(checkbox(html, 'github')).not.toContain('checked');
    expect(checkbox(html, 'linear')).toBeNull();
    expect(checkbox(html, 'slack')).toBeNull();
  });

  it('annonce les autres « Bientôt disponibles », sans case', () => {
    const html = render(step());
    const soon = html.slice(html.indexOf('Coming soon'));

    expect(soon).toContain('linear');
    expect(soon).toContain('slack');
    expect(soon).not.toContain('<input');
  });

  it('le bouton compte ce qu’il reste à brancher et part vers la file', () => {
    const html = render(step({ recommended: ['github', 'gmail'] }));

    expect(html).toContain('type="submit"');
    expect(html).toContain('Connect 2 tools');
    expect(html).toContain('I’ll connect them later');
  });

  it('reprend le choix gardé plutôt que les conseils', () => {
    const html = render(step({ recommended: ['gmail'], chosen: ['github'] }));

    expect(checkbox(html, 'github')).toContain('checked');
    expect(checkbox(html, 'gmail')).not.toContain('checked');
  });

  it('un outil déjà branché se lit, sans case ; rien à brancher : Continuer mène à la suite', () => {
    const html = render(step({ conns: [mine('github')], chosen: [] }));

    expect(checkbox(html, 'github')).toBeNull();
    expect(html).not.toContain('type="submit"');
    expect(html).toContain('href="/bienvenue/collaborateurs"');
    expect(html).toContain('>Continue<');
  });
});

describe('ToolsStep : la file « Branchez-les un par un »', () => {
  it('ouvre le premier outil à brancher, avec son formulaire de connexion dans la page', () => {
    const html = render(step({ connecting: true, chosen: ['github', 'gmail'] }));

    expect(html).toContain('Connect them one by one');
    expect(html).toContain('Connected: 0 of 2');
    expect(html).toContain('data-add="github"');
    expect(html).not.toContain('data-add="gmail"');
    expect(html).toContain('href="/bienvenue/outils"');
    expect(html).toContain('I’ll connect the rest later');
  });

  it('un outil branché est coché et la progression avance ; le suivant s’ouvre', () => {
    const html = render(
      step({ connecting: true, chosen: ['github', 'gmail'], conns: [mine('github')] }),
    );

    expect(html).toContain('Connected: 1 of 2');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('data-add="gmail"');
  });

  it('au retour d’un échec, l’outil concerné reste ouvert', () => {
    const notice = { tone: 'error', text: 'Connexion à Gmail annulée.', tool: 'gmail' } as const;
    const html = render(
      step({
        connecting: true,
        chosen: ['github', 'gmail'],
        notice: { ...notice, adminConsent: false },
      }),
    );

    expect(html).toContain('data-add="gmail"');
    expect(html).not.toContain('data-add="github"');
  });

  it('tout branché : le bravo et Continuer', () => {
    const html = render(
      step({ connecting: true, chosen: ['gmail'], conns: [mine('github'), mine('gmail')] }),
    );

    expect(html).toContain('Everything is connected');
    expect(html).toContain('href="/bienvenue/collaborateurs"');
    expect(html).not.toContain('data-add=');
  });

  it('sans rien dans la file (choix perdu), on revient au choix', () => {
    const html = render(step({ connecting: true, chosen: [] }));

    expect(html).not.toContain('Connect them one by one');
    expect(html).toContain('Ready to connect');
  });

  it('se lit en français', () => {
    const html = render(step({ connecting: true, chosen: ['gmail'] }), 'fr');

    expect(html).toContain('Branchez-les un par un');
    expect(html).toContain('Branchés : 0 sur 1');
  });
});

describe('ToolsStep : Vos outils de code', () => {
  const withCode = (recommended: string[], codeCommand: string | null) =>
    step({ recommended, codeCommand, codeInstructions: codeCommand && INSTRUCTIONS });

  it('vient en tête, avant les outils, quand le service travaille dans un dépôt', () => {
    const html = render(withCode(['github', 'linear'], COMMAND));

    expect(html).toContain(COMMAND);
    expect(html.indexOf(CARD)).toBeGreaterThan(-1);
    expect(html.indexOf(CARD)).toBeLessThan(html.indexOf('<fieldset'));
  });

  it('vient à la fin, après les outils et avant le bouton, pour les autres services', () => {
    const html = render(withCode(['linear', 'gmail'], COMMAND));

    expect(html.indexOf(CARD)).toBeGreaterThan(html.lastIndexOf('</fieldset>'));
    expect(html.indexOf(CARD)).toBeLessThan(html.indexOf('type="submit"'));
  });

  it('ne s’affiche pas sans commande : l’adresse du serveur est refusée, rien de faux à copier', () => {
    const html = render(withCode(['github'], null));

    expect(html).not.toContain(CARD);
    expect(html).not.toContain('/reglages#ordinateurs');
  });

  it('se lit en français', () => {
    expect(render(withCode(['github'], COMMAND), 'fr')).toContain('Vos outils de code');
  });

  // Seul le bloc s'ajoute : les cases cochées et le bouton restent ce qu'ils étaient.
  it('ne change que par le bloc, en tête comme à la fin', () => {
    for (const recommended of [['github', 'linear'], ['gmail']]) {
      const without = render(withCode(recommended, null));
      const withCard = render(withCode(recommended, COMMAND));
      const card = render(
        createElement(CodeToolsCard, { command: COMMAND, instructions: INSTRUCTIONS }),
      );

      expect(withCard).toContain(card);
      expect(withCard.replace(card, '')).toBe(without);
      expect(without).toContain('Connect 1 tool');
    }
  });
});
