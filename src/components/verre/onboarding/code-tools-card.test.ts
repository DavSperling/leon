import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { CodeToolsCard } from './code-tools-card';

// Les boutons « Copier » que la carte pose elle-même (pas celui de CodeLine) : ce qu'ils copient et confirment.
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

// La documentation s'ouvre dans un autre onglet : l'étape garde ses cases cochées.
const DOCS_LINK = /<a (?=[^>]*target="_blank")[^>]*href="\/documentation"[^>]*>Documentation/;
const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const INSTRUCTIONS = 'Install Leon: curl -fsSL https://leon.example/install | sh';
const render = (
  locale: 'en' | 'fr',
  messages: typeof en | typeof fr,
  instructions: string | null = INSTRUCTIONS,
) => {
  copies.length = 0;
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(CodeToolsCard, { command: COMMAND, instructions }),
    }),
  );
};

// S13 : le bloc « Vos outils de code » de l'étape Vos outils.
describe('CodeToolsCard', () => {
  it('se lit en anglais : titre, consigne, commande et liens vers Réglages et la documentation', () => {
    const html = render('en', en);

    expect(html).toContain('Your coding tools');
    expect(html).toContain(
      'Open a terminal on your computer and paste this command. Your browser will open so you can authorize this computer.',
    );
    expect(html).toContain(`>${COMMAND}</code>`);
    expect(html).toMatch(/<a [^>]*href="\/reglages#ordinateurs"[^>]*>What gets sent<\/a>/);
    expect(html).toMatch(DOCS_LINK);
  });

  it('se lit en français, avec les textes de la fiche', () => {
    const html = render('fr', fr);

    expect(html).toContain('Vos outils de code');
    expect(html).toContain(
      'Ouvrez un terminal sur votre ordinateur et collez cette commande. Votre navigateur s’ouvrira pour autoriser cet ordinateur.',
    );
    expect(html).toContain(`>${COMMAND}</code>`);
    expect(html).toMatch(/<a [^>]*href="\/reglages#ordinateurs"[^>]*>Ce qui part<\/a>/);
    expect(html).toMatch(DOCS_LINK);
  });

  it('nomme les quatre outils, avec un logo quand Simple Icons en a un', () => {
    const html = render('en', en);

    for (const name of ['Claude Code', 'Codex', 'Cursor', 'Antigravity']) {
      expect(html, name).toContain(name);
    }
    expect(html).toContain('src="/logos/claude-code.svg"');
    expect(html).toContain('src="/logos/cursor.svg"');
    // Pas de logo inventé pour Codex ni Antigravity : une icône de terminal neutre.
    expect(html.match(/<img /g)).toHaveLength(2);
    // deux icônes de terminal, la copie de la commande et de la consigne, la flèche du lien vers la documentation
    expect(html.match(/<svg /g)).toHaveLength(2 + 1 + 1 + 1);
  });

  it('donne un bouton Copier à la commande', () => {
    expect(render('en', en)).toMatch(/<button[^>]*>.*Copy<\/button>/);
    expect(render('fr', fr)).toMatch(/<button[^>]*>.*Copier<\/button>/);
  });

  // Les deux chemins à égalité (même titre, même texte), « Je demande à Claude » d'abord.
  it.each([
    ['en', en, 'Install with Claude Code', 'Install in a terminal', 'Ask Claude'],
    ['fr', fr, 'Installer avec Claude Code', 'Installer dans un terminal', 'Je demande à Claude'],
  ] as const)(
    'présente « %s » : Claude Code d’abord, puis le terminal, au même niveau',
    (locale, messages, withClaude, inTerminal, ask) => {
      const html = render(locale, messages);

      const claude = html.indexOf(`>${withClaude}</h3>`);
      const terminal = html.indexOf(`>${inTerminal}</h3>`);
      expect(claude).toBeGreaterThan(-1);
      expect(terminal).toBeGreaterThan(claude);
      expect(html.indexOf(`>${ask}</button>`)).toBeGreaterThan(claude);
      expect(html.indexOf(`>${ask}</button>`)).toBeLessThan(terminal);
      expect(html.indexOf(COMMAND)).toBeGreaterThan(terminal);
    },
  );

  it('copie la consigne avec « Je demande à Claude » et confirme où la coller', () => {
    render('fr', fr);

    expect(copies).toEqual([
      expect.objectContaining({
        value: INSTRUCTIONS,
        label: 'Je demande à Claude',
        copiedMessage: 'Consigne copiée. Collez-la dans Claude Code.',
      }),
    ]);
  });

  it('sans consigne, garde la commande et le terminal', () => {
    const html = render('en', en, null);

    expect(copies).toEqual([]);
    expect(html).not.toContain('Ask Claude');
    expect(html).not.toContain('Install with Claude Code');
    expect(html).toContain(`>${COMMAND}</code>`);
  });
});
