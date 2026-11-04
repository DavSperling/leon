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

// Les boutons « Copier » que la section pose elle-même (pas celui de CodeLine) : ce qu'ils copient et confirment.
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
};
const NEVER_USED = { ...MACBOOK, id: 'c2', name: 'Linux-bureau', lastUsedAt: null };

const render = (
  props: { computers: Token[]; command: string | null; instructions?: string | null },
  locale: 'en' | 'fr' = 'en',
) => {
  copies.length = 0;
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(ComputersSection, {
        instructions: props.command === null ? null : INSTRUCTIONS,
        ...props,
      }),
    }),
  );
};

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

  // M4 : la phrase de confidentialité ne figure pas dans ce texte neuf ; celle du texte d'accord de la CLI ne change pas.
  it('ne redit pas que la session reste privée à son auteur, dans les deux langues', () => {
    expect(en.settings.computersDescription).not.toMatch(/private/i);
    expect(fr.settings.computersDescription).not.toMatch(/privée/i);
    expect(render({ computers: [MACBOOK], command: COMMAND })).not.toMatch(/private/i);
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

  it('se lit en français', () => {
    const html = render({ computers: [MACBOOK], command: COMMAND }, 'fr');

    expect(html).toContain('Ordinateurs connectés');
    expect(html).toContain('Révoquer');
  });

  // Les deux chemins à égalité (même titre, même texte), « Je demande à Claude » d'abord, puis la documentation.
  it.each([
    ['en', 'With Claude Code', 'In a terminal', 'Ask Claude'],
    ['fr', 'Avec Claude Code', 'Dans un terminal', 'Je demande à Claude'],
  ] as const)(
    'présente « %s » : Claude Code d’abord, puis le terminal, au même niveau',
    (locale, withClaude, inTerminal, ask) => {
      const html = render({ computers: [], command: COMMAND }, locale);

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
    render({ computers: [MACBOOK], command: COMMAND }, 'fr');

    expect(copies).toEqual([
      expect.objectContaining({
        value: INSTRUCTIONS,
        label: 'Je demande à Claude',
        copiedMessage: 'Consigne copiée. Collez-la dans Claude Code.',
      }),
    ]);
  });

  it('sans consigne, garde la commande ; sans commande, ne montre ni l’un ni l’autre', () => {
    const noInstructions = render({ computers: [], command: COMMAND, instructions: null });
    expect(copies).toEqual([]);
    expect(noInstructions).not.toContain('Ask Claude');
    expect(noInstructions).toContain(COMMAND);

    const noCommand = render({ computers: [MACBOOK], command: null });
    expect(copies).toEqual([]);
    expect(noCommand).not.toContain('Ask Claude');
    expect(noCommand).not.toContain('/documentation');
  });
});
