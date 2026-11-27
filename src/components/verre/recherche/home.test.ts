import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/verre';
import en from '../../../../messages/en.json';
import { BriefingSheet, type BriefingSourceView, Greeting, HomeAsk } from './home';

// L'Accueil rendu côté serveur (pas de DOM ici) : ce que le point du matin, le bonjour et le champ doivent porter.

// Les actions du serveur ne sont pas appelées au rendu : leurs modules (base, session) ne se chargent pas ici.
vi.mock('@/app/(app)/actions', () => ({
  dismissBriefingLinesAction: vi.fn(),
  previewPassageAction: vi.fn(),
  refreshBriefingAction: vi.fn(),
  restoreBriefingLinesAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(app)/discussions/actions', () => ({
  citationDetailsAction: vi.fn(),
  dismissAboutSuggestionAction: vi.fn(),
  newDiscussionAction: vi.fn(),
  saveAboutSuggestionAction: vi.fn(),
}));

const h = createElement as unknown as (
  type: unknown,
  props?: object | null,
  ...children: ReactNode[]
) => ReactElement;
const html = (node: ReactNode) =>
  renderToStaticMarkup(
    h(NextIntlClientProvider, { locale: 'en', messages: en }, h(TooltipProvider, null, node)),
  );

const source = (n: number, passageId: string | null = `passage-${n}`): BriefingSourceView => ({
  n,
  passageId,
  title: `Ticket ${n}`,
  url: null,
  kind: 'linear',
  visibility: 'equipe',
});
const CHANGED = { text: 'Sophie moved the migration to December.', refs: [3, 1] };
const SECTIONS = [
  { title: 'What you did', lines: [{ text: 'Nothing to report.', refs: [] }] },
  { title: 'What changed', lines: [CHANGED, { text: 'A source without a passage.', refs: [2] }] },
  { title: 'What is still open', lines: [{ text: 'The Verlant quote.', refs: [1] }] },
];
const SOURCES = [source(1), source(2, null), source(3)];
// une ligne : son bloc, de son ouverture à la fin de son paragraphe
const lineOf = (markup: string, words: string) => {
  const end = markup.indexOf('</p>', markup.indexOf(words));
  return markup.slice(markup.lastIndexOf('<div', markup.indexOf(words)), end);
};

describe('BriefingSheet', () => {
  const sheet = html(
    h(BriefingSheet, { project: 'github.com/acme/leon', sections: SECTIONS, sources: SOURCES }),
  );

  it('écrit les trois parties dans la langue de l’écran, sans lister les sources', () => {
    expect(sheet).toContain('>What you did</h3>');
    expect(sheet).toContain('>What changed</h3>');
    expect(sheet).toContain('>Still open</h3>');
    expect(sheet).not.toContain('What is still open');
    expect(sheet).not.toContain('Ticket 1</');
  });

  it('une ligne ouvre sa première source en entier ; ses autres numéros restent des boutons', () => {
    const line = lineOf(sheet, 'Sophie moved');
    // toute la ligne : un bouton nommé par la source 3, et le trait de sa couleur quand on la pointe
    expect(line).toMatch(/class="[^"]*\bhl-pass hl-3\b/);
    expect(line).toMatch(
      /<button type="button" aria-label="Source 3: Ticket 3" title="Source 3: Ticket 3" class="absolute inset-0/,
    );
    // le dernier mot reste avec ses numéros
    expect(line).toMatch(
      /<span class="whitespace-nowrap"><span class="hl hl--b[^"]*">December\.<\/span>/,
    );
    // le numéro de la source ouverte par la ligne n'est pas un second bouton ; celui de l'autre source en est un
    expect(line).toMatch(/<span aria-hidden="true" class="cite pointer-events-none c3">3<\/span>/);
    expect(line).toMatch(/<button type="button" aria-label="Source 1: Ticket 1"[^>]*>1<\/button>/);
    expect(line.match(/<button/g)).toHaveLength(2);
  });

  it('une ligne sans source à ouvrir reste de l’encre : ni bouton, ni trait', () => {
    // (la phrase est écrite en deux morceaux : son dernier mot à part)
    for (const words of ['Nothing to', 'A source without']) {
      const line = lineOf(sheet, words);
      expect(line).toContain(`<span>${words}`);
      expect(line).not.toContain('<button');
      expect(line).not.toContain('hl');
    }
    // le numéro d'une source sans passage reste écrit, et lu
    expect(lineOf(sheet, 'A source without')).toContain(
      '<span class="cite pointer-events-none c2">2</span>',
    );
  });

  it('chaque ligne a sa croix « c’est réglé », nommée, au-dessus du bouton de la ligne', () => {
    const crosses = sheet.match(/<button[^>]*aria-label="Settled: remove this line"[^>]*>/g) ?? [];
    expect(crosses).toHaveLength(4);
    for (const cross of crosses) expect(cross).toContain('z-[2]');
  });

  it('a son bouton « Delete » pour le point entier, et le titre que lui donne l’Accueil', () => {
    expect(sheet.match(/<button[^>]*>.*?Delete<\/button>/g)).toHaveLength(1);
    const titled = html(
      h(BriefingSheet, {
        project: 'github.com/acme/leon',
        heading: h('span', null, 'leon'),
        sections: SECTIONS,
        sources: SOURCES,
      }),
    );
    expect(titled).toContain('<span>leon</span>');
  });

  it('propose « Redo » seulement quand un modèle est branché', () => {
    expect(sheet).not.toContain('Redo');
    const redo = html(
      h(BriefingSheet, {
        project: 'github.com/acme/leon',
        sections: SECTIONS,
        sources: SOURCES,
        canRedo: true,
      }),
    );
    expect(redo.match(/<button[^>]*>.*?Redo<\/button>/g)).toHaveLength(1);
  });
});

describe('Greeting', () => {
  it('dit bonjour à l’heure donnée, avec ou sans prénom, et rien dessous', () => {
    const named = html(h(Greeting, { name: 'Julie', serverPart: 'morning' }));
    expect(named).toContain('>Good morning, Julie.</h1>');
    // plus de phrase du point sous le bonjour : elle répétait une ligne du point du matin, sans pouvoir s'enlever
    expect(named).toMatch(/<\/h1><\/header>$/);
    expect(html(h(Greeting, { name: null, serverPart: 'evening' }))).toContain(
      '>Good evening.</h1>',
    );
  });
});

describe('HomeAsk', () => {
  it('demande à Leon quand un modèle est branché, cherche sinon', () => {
    const ask = html(h(HomeAsk, { canAsk: true }));
    expect(ask).toContain('name="question"');
    // le champ se mesure dans le navigateur : rendu ici, il a son indicatif court, et son nom en entier
    expect(ask).toContain('placeholder="Ask or search…"');
    expect(ask).toContain('>Ask or search everything Leon has saved</label>');
    expect(ask).toMatch(/<button type="submit"[^>]*>Ask</);
    // ⌘K met le curseur dans ce champ (app-shell.tsx)
    expect(ask).toContain('data-ask=""');

    const search = html(h(HomeAsk, { canAsk: false }));
    expect(search).toMatch(/<form [^>]*action="\/"/);
    expect(search).toContain('name="q"');
    expect(search).toMatch(/<button type="submit"[^>]*>Search</);
  });
});
