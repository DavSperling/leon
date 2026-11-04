import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { DocumentationPage } from './documentation';
import { documentationMarkdown, SECTIONS } from './documentation-markdown';

const ADDRESS = 'https://leon.example';
const COMMAND = `curl -fsSL ${ADDRESS}/install | sh`;
const INSTRUCTIONS = `Install Leon.\n1. Run this command: ${COMMAND}\nSee ${ADDRESS}/documentation.md`;
const LOCALES = [
  ['en', en],
  ['fr', fr],
] as const;
type Props = { command: string | null; address: string | null; instructions: string | null };
const GIVEN: Props = { command: COMMAND, address: ADDRESS, instructions: INSTRUCTIONS };
const GENERIC: Props = { command: null, address: null, instructions: null };

const markdown = (locale: 'en' | 'fr', props: Props = GIVEN) =>
  documentationMarkdown({ locale, messages: locale === 'en' ? en : fr, ...props });

// La page, pour comparer ses commandes à celles du Markdown (même lecture que documentation.test.ts).
const page = (locale: 'en' | 'fr', props: Props = GIVEN) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(DocumentationPage, props),
    }),
  );
const decode = (html: string) =>
  html
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
const flat = (text: string) => text.replace(/\s+/g, ' ');
const codesOf = (html: string) =>
  [...html.matchAll(/<code[^>]*>(.*?)<\/code>/gs)].map((match) =>
    flat(decode((match[1] ?? '').replace(/<[^>]*>/g, ' '))).trim(),
  );
// Le texte hors des blocs de code et des `morceaux de code` : là, aucune balise HTML.
const prose = (md: string) => md.replace(/^```[\s\S]*?^```$/gm, '').replace(/`[^`\n]*`/g, '');

describe('documentationMarkdown', () => {
  it.each(LOCALES)(
    'a un # pour le titre, puis un ## par section, dans l’ordre de la page (%s)',
    (locale, messages) => {
      const md = markdown(locale);
      const d = messages.site.documentation;

      expect(md.startsWith(`# ${d.heroTitle}\n`)).toBe(true);
      expect(md.match(/^# /gm)).toHaveLength(1);
      const headings = [...md.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      expect(headings).toEqual(SECTIONS.map(({ id, key }) => `${d[key].title} {#${id}}`));
      expect(SECTIONS.map(({ id }) => id)).toEqual(
        [...page(locale).matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]),
      );
    },
  );

  // Toutes les phrases de la page y sont, dans la langue demandée, sans les libellés d'interface.
  it.each(LOCALES)(
    'reprend chaque texte de la page, sans en recopier un seul (%s)',
    (locale, messages) => {
      const md = markdown(locale);
      // L'interface de la page, et ce qu'elle ne montre que sans adresse (testé plus bas).
      const UI = ['kicker', 'heroClaude', 'heroTerminal', 'toc', 'addressPlaceholder', 'view'];
      const GENERIC_ONLY = ['unavailable', 'leadGeneric'];
      const leaves = (tree: Record<string, unknown>): string[] =>
        Object.entries(tree)
          .filter(([key]) => !GENERIC_ONLY.includes(key))
          .flatMap(([, value]) =>
            typeof value === 'string' ? [value] : leaves(value as Record<string, unknown>),
          );
      const texts = Object.entries(messages.site.documentation)
        .filter(([key]) => !UI.includes(key))
        .flatMap(([, value]) => (typeof value === 'string' ? [value] : leaves(value)));

      expect(texts.length).toBeGreaterThan(50);
      for (const text of texts)
        for (const piece of text.replace(/<\/?code>/g, '`').split('{path}'))
          expect(md, piece).toContain(piece);
      const s = messages.settings;
      expect(md).toContain(`${s.title} › ${s.tabIntegrations} › ${s.computersTitle} › ${s.revoke}`);
      expect(md).toContain(`${s.title} › ${s.tabIntegrations} › ${s.tokensTitle}`);
    },
  );

  it.each(LOCALES)(
    'met les commandes en ```sh et la consigne en ```text, sur l’adresse du serveur (%s)',
    (locale) => {
      const md = markdown(locale);

      expect(md).toContain(`\`\`\`sh\n${COMMAND}\n\`\`\``);
      expect(md).toContain(`\`\`\`text\n${INSTRUCTIONS}\n\`\`\``);
      expect(md).toContain(`\`\`\`sh\n~/.leon/bin/leon update --previous\n\`\`\``);
      expect(md).toContain(
        `\`\`\`sh\n~/.leon/bin/leon login --with-token --url ${ADDRESS}\n\`\`\``,
      );
      expect(md).toContain('```sh\npnpm leon setup --depot <clone>\n```');
      expect(md).toContain('```sh\npnpm leon installer-crochets\n```');
      // un seul bloc de consigne, et les blocs sont tous fermés
      expect(md.match(/^```text$/gm)).toHaveLength(1);
      expect(md.match(/^```/gm)?.length).toBe(12);
    },
  );

  // « Chaque commande de la page » : tout ce que la page met en <code> est dans le Markdown.
  it.each(LOCALES)('porte chaque commande et chaque bout de code de la page (%s)', (locale) => {
    const md = flat(markdown(locale));
    const codes = codesOf(page(locale));

    expect(codes.length).toBeGreaterThan(30);
    for (const code of codes) expect(md, code).toContain(code);
  });

  it.each(LOCALES)('ne contient ni balise HTML ni texte d’interface (%s)', (locale, messages) => {
    const md = markdown(locale);

    expect(prose(md)).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(md).not.toContain('&');
    expect(md).not.toContain(' '); // pas de typographie d'écran : du texte brut
    const { claudeCode, common } = messages;
    const d = messages.site.documentation;
    // « Ask Claude » (le bouton) est le début du titre « Ask Claude Code » : seul le bouton seul est de l'interface.
    expect(md).not.toMatch(new RegExp(`${claudeCode.ask}(?! Code)`));
    for (const label of [
      claudeCode.copied,
      common.copy,
      d.heroTerminal, // (heroClaude porte le titre de la section « Ask Claude Code » : ce n'est pas un repère)
      d.toc,
      d.kicker,
    ])
      expect(md, label).not.toContain(label);
  });

  // L'adresse est refusée : la forme générique, à adapter, comme sur la page ; aucune adresse n'est inventée.
  it.each([
    ['en', 'address of your Leon'],
    ['fr', 'adresse de votre Leon'],
  ] as const)(
    'donne la forme générique quand l’adresse est refusée (%s)',
    (locale, placeholder) => {
      const md = markdown(locale, GENERIC);
      const d = (locale === 'en' ? en : fr).site.documentation;

      expect(md).toContain(`\`\`\`sh\ncurl -fsSL <${placeholder}>/install | sh\n\`\`\``);
      expect(md).toContain(
        `\`\`\`sh\n~/.leon/bin/leon login --with-token --url <${placeholder}>\n\`\`\``,
      );
      expect(md).toContain(d.claude.unavailable);
      expect(md).toContain(d.terminal.leadGeneric);
      expect(md).not.toContain(d.terminal.lead);
      expect(md).not.toContain('```text');
      expect(md).not.toContain('https://');
      expect(md.match(/^## /gm)).toHaveLength(SECTIONS.length);
      expect(prose(md)).not.toMatch(/<\/?[a-z][^>]*>/i);
    },
  );

  it('finit par un retour à la ligne, sans ligne vide en trop', () => {
    const md = markdown('en');

    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
    expect(md).not.toMatch(/\n{3}/);
  });
});
