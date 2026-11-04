import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { CodeToolsCard } from './code-tools-card';

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const render = (locale: 'en' | 'fr', messages: typeof en | typeof fr) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(CodeToolsCard, { command: COMMAND }),
    }),
  );

// S13 : le bloc « Vos outils de code » de l'étape Vos outils.
describe('CodeToolsCard', () => {
  it('se lit en anglais : titre, consigne, commande et lien vers Réglages', () => {
    const html = render('en', en);

    expect(html).toContain('Your coding tools');
    expect(html).toContain(
      'Open a terminal on your computer and paste this command. Your browser will open so you can authorize this computer.',
    );
    expect(html).toContain(`>${COMMAND}</code>`);
    expect(html).toMatch(/<a [^>]*href="\/reglages#ordinateurs"[^>]*>What gets sent<\/a>/);
  });

  it('se lit en français, avec les textes de la fiche', () => {
    const html = render('fr', fr);

    expect(html).toContain('Vos outils de code');
    expect(html).toContain(
      'Ouvrez un terminal sur votre ordinateur et collez cette commande. Votre navigateur s’ouvrira pour autoriser cet ordinateur.',
    );
    expect(html).toContain(`>${COMMAND}</code>`);
    expect(html).toMatch(/<a [^>]*href="\/reglages#ordinateurs"[^>]*>Ce qui part<\/a>/);
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
    expect(html.match(/<svg /g)).toHaveLength(2 + 1 /* le bouton Copier */);
  });

  it('donne un bouton Copier à la commande', () => {
    expect(render('en', en)).toMatch(/<button[^>]*>.*Copy<\/button>/);
    expect(render('fr', fr)).toMatch(/<button[^>]*>.*Copier<\/button>/);
  });
});
