import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { ComputerSetup } from './computers';
import { captionOf, type Token, TokenFacts } from './tokens';

// Les actions importent Better Auth : seul le dessin de la section se teste ici.
vi.mock('@/app/(app)/reglages/actions', () => ({
  revokeTokenAction: vi.fn(),
  createTokenAction: vi.fn(),
}));

// Les boutons « Copier » que le panneau pose lui-même (pas celui de CodeLine) : ce qu'ils copient et confirment.
const copies: Record<string, unknown>[] = [];
vi.mock('@/components/verre/ui/copy', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/verre/ui/copy')>();
  return {
    ...real,
    CopyButton: (props: Parameters<typeof real.CopyButton>[0]) => {
      copies.push(props);
      return real.CopyButton(props);
    },
  };
});

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const INSTRUCTIONS = `Install Leon: ${COMMAND}`;
const MACBOOK: Token = {
  id: 'c1',
  name: 'MacBook',
  hint: 'abcd',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  lastUsedAt: new Date('2026-11-02T10:00:00Z'),
  kind: 'ordinateur',
  clientName: null,
  clientHost: null,
};
const NEVER_USED = { ...MACBOOK, id: 'c2', name: 'Linux-bureau', lastUsedAt: null };

const wrap = (child: ReturnType<typeof createElement>, locale: 'en' | 'fr' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: child,
    }),
  );

const render = (
  props: { command: string | null; instructions?: string | null },
  locale: 'en' | 'fr' = 'en',
) => {
  copies.length = 0;
  return wrap(
    createElement(ComputerSetup, {
      instructions: props.command === null ? null : INSTRUCTIONS,
      ...props,
    }),
    locale,
  );
};

// S14 : « Connecter un ordinateur », le panneau de la tuile #ordinateurs (le lien « Ce qui part » de l'onboarding).
describe('ComputerSetup', () => {
  it('montre la commande à copier', () => {
    expect(render({ command: COMMAND })).toContain(`>${COMMAND}</code>`);
  });

  it('sans commande (adresse du serveur refusée), ne montre rien de faux à copier', () => {
    expect(render({ command: null })).toBe('');
  });

  // M4 : la phrase de confidentialité ne figure pas dans ce texte neuf ; celle du texte d'accord de la CLI ne change pas.
  it('ne redit pas que la session reste privée à son auteur, dans les deux langues', () => {
    expect(en.settings.computersDescription).not.toMatch(/private/i);
    expect(fr.settings.computersDescription).not.toMatch(/privée/i);
    expect(render({ command: COMMAND })).not.toMatch(/private/i);
  });

  // La révocation d'un ordinateur dit comment le reconnecter : le lanceur n'est pas dans le PATH.
  it.each([
    ['en', en.settings.computerRevokeDescription],
    ['fr', fr.settings.computerRevokeDescription],
  ])(
    'après une révocation (%s), donne le lanceur à lancer, ou la commande à recoller',
    (_locale, text) => {
      expect(text).toContain('~/.leon/bin/leon login');
      expect(text).not.toMatch(/(?<!\/)\bleon login/);
    },
  );

  // Les deux chemins à égalité (même titre, même texte), « Je demande à Claude » d'abord, puis la documentation.
  it.each([
    ['en', 'Install with Claude Code', 'Install in a terminal', 'Ask Claude'],
    ['fr', 'Installer avec Claude Code', 'Installer dans un terminal', 'Je demande à Claude'],
  ] as const)(
    'présente « %s » : Claude Code d’abord, puis le terminal, au même niveau',
    (locale, withClaude, inTerminal, ask) => {
      const html = render({ command: COMMAND }, locale);

      const claude = html.indexOf(`>${withClaude}</h3>`);
      const terminal = html.indexOf(`>${inTerminal}</h3>`);
      expect(claude).toBeGreaterThan(-1);
      expect(terminal).toBeGreaterThan(claude);
      expect(html.indexOf(`>${ask}</button>`)).toBeGreaterThan(claude);
      expect(html.indexOf(`>${ask}</button>`)).toBeLessThan(terminal);
      expect(html.indexOf(COMMAND)).toBeGreaterThan(terminal);
      // La documentation s'ouvre dans un autre onglet.
      expect(html).toMatch(
        /<a (?=[^>]*target="_blank")[^>]*href="\/documentation"[^>]*>Documentation/,
      );
    },
  );

  it('copie la consigne avec « Je demande à Claude » et confirme où la coller', () => {
    render({ command: COMMAND }, 'fr');

    expect(copies).toEqual([
      expect.objectContaining({
        value: INSTRUCTIONS,
        label: 'Je demande à Claude',
        copiedMessage: 'Consigne copiée. Collez-la dans Claude Code.',
      }),
    ]);
  });

  it('sans consigne, garde la commande ; sans commande, ne montre ni l’un ni l’autre', () => {
    const noInstructions = render({ command: COMMAND, instructions: null });
    expect(copies).toEqual([]);
    expect(noInstructions).not.toContain('Ask Claude');
    expect(noInstructions).toContain(COMMAND);

    const noCommand = render({ command: null });
    expect(copies).toEqual([]);
    expect(noCommand).not.toContain('/documentation');
  });
});

// Le panneau d'un ordinateur connecté : sa connexion et sa dernière utilisation ; la carte n'en dit que le nom.
describe('TokenFacts et captionOf, pour un ordinateur', () => {
  it('dit quand il a été connecté et utilisé, ou jamais', () => {
    const used = wrap(createElement(TokenFacts, { token: MACBOOK }));
    expect(used).toContain('>Connected<');
    expect(used).toContain('>Last used<');
    expect(used).not.toContain('Never used');
    expect(used).not.toContain('leon_…');

    expect(wrap(createElement(TokenFacts, { token: NEVER_USED }))).toContain('Never used');
    expect(wrap(createElement(TokenFacts, { token: NEVER_USED }), 'fr')).toContain(
      'Jamais utilisé',
    );
  });

  it('légende la carte d’un ordinateur par sa sorte, celle d’un jeton par son indice', () => {
    expect(captionOf(MACBOOK, 'Computer')).toBe('Computer');
    expect(captionOf({ ...MACBOOK, kind: 'manuel' }, 'Computer')).toBe('leon_…abcd');
  });
});
