import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import { Avatar, initialsOf, tintOf } from './avatar';
import { Badge } from './badge';
import { CitationChip, NoSource, SourceNumber, ToolLogo } from './chips';
import { PageHeader, Section } from './layout';
import { Flag, Reading, Strokes, toneOf } from './marks';
import { OriginalSheet } from './original-sheet';
import { SearchField } from './search-field';
import { Fact, Facts, PanelDone, SidePanel, StatusRow } from './side-panel';
import { Thing, ThingGrid } from './thing';

// Les nouvelles pièces du kit, rendues côté serveur (pas de DOM ici) : leurs états, et ce que les écrans en attendent.
// Les enfants sont passés en argument : le type de createElement les voudrait aussi dans les props quand le
// composant les exige.
const h = createElement as unknown as (
  type: unknown,
  props?: object | null,
  ...children: ReactNode[]
) => ReactElement;
const html = (node: ReactNode) =>
  renderToStaticMarkup(h(NextIntlClientProvider, { locale: 'en', messages: en }, node));

describe('Thing', () => {
  it('est un bouton de 52 px (tile) par défaut, de 88 px (card) sur demande, avec un nom, une légende et un chevron', () => {
    const tile = html(h(Thing, { name: 'Outlook', caption: 'Team' }));
    expect(tile).toMatch(/^<button type="button" class="tl tile"/);
    expect(tile).toContain('<span class="mark">Outlook</span>');
    expect(tile).toContain('<span class="tl__sub">Team</span>');
    expect(tile).toContain('tl__chev');
    expect(html(h(Thing, { size: 'card', name: 'Gmail' }))).toMatch(/class="tl card"/);
  });

  it('est un lien quand il a une adresse, et un seul contrôle : jamais de bouton dedans', () => {
    const link = html(h(Thing, { name: 'Handbook.pdf', href: '/documents', pill: 'Open' }));
    expect(link).toMatch(/^<a class="tl tile"[^>]* href="\/documents"/);
    expect(link).not.toContain('<button');
    // la pastille prend la place du chevron
    expect(link).toContain('<span class="tl__pill">Open</span>');
    expect(link).not.toContain('tl__chev');
  });

  it('dit ce qui ne va pas : légende rouge et point sur l’image', () => {
    const err = html(
      h(Thing, {
        name: 'Intercom',
        caption: 'Disconnected',
        error: true,
        picture: 'logo',
        pill: 'Reconnect',
        pillInk: true,
      }),
    );
    expect(err).toContain('is-err');
    expect(err).toContain('<span class="tl__dot"></span>');
    expect(err).toContain('tl__pill tl__pill--ink');
    expect(html(h(Thing, { name: 'Gmail', picture: 'logo' }))).not.toContain('tl__dot');
  });

  it('porte le numéro d’une source dans sa couleur, et dit qu’il travaille', () => {
    const src = html(h(Thing, { name: 'Signed quote', num: 6 }));
    expect(src).toContain('<span class="num c2">6</span>');
    expect(src).toContain('hl-2');
    const busy = html(h(Thing, { name: 'Grid.xlsx', caption: 'Reading…', working: true }));
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('<span class="mark is-working">Reading…</span>');
  });

  it('pose chaque chose dans son <li>, sur trois colonnes au plus quand on le demande', () => {
    const grid = html(
      h(
        ThingGrid,
        { cols: 3 },
        h(Thing, { key: 'a', name: 'A' }),
        h(Thing, { key: 'b', name: 'B' }),
      ),
    );
    expect(grid).toMatch(/^<ul class="things things-3">/);
    expect(grid.match(/<li>/g)).toHaveLength(2);
  });
});

describe('Avatar', () => {
  it('écrit deux initiales, et garde la même teinte pour la même personne', () => {
    expect(initialsOf('Julie Martin')).toBe('JM');
    expect(initialsOf('Jean-Paul de la Tour')).toBe('JT');
    expect(initialsOf('Leon')).toBe('LE');
    expect(initialsOf('David (démo)')).toBe('DD');
    expect(initialsOf('  ')).toBe('?');
    expect(tintOf('Julie Martin')).toBe(tintOf(' julie martin '));
    for (const name of ['Julie Martin', 'Karim Benali', '', 'Zoé']) {
      expect([1, 2, 3, 4]).toContain(tintOf(name));
    }
  });

  it('est un rond : la photo quand il y en a une, sinon les initiales sur leur teinte', () => {
    const initials = html(h(Avatar, { name: 'Karim Benali', size: 36 }));
    expect(initials).toContain('rounded-full');
    expect(initials).toContain(`bg-m${tintOf('Karim Benali')}`);
    expect(initials).toContain('>KB</span>');
    const photo = html(h(Avatar, { name: 'Karim Benali', src: 'https://exemple.test/k.jpg' }));
    expect(photo).toContain('<img src="https://exemple.test/k.jpg"');
    expect(photo).not.toContain('KB');
  });
});

describe('les marques', () => {
  it('la couleur de la source n revient tous les quatre numéros', () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(toneOf)).toEqual([1, 2, 3, 4, 1, 4, 1]);
    expect(toneOf(0)).toBe(4);
  });

  it('le drapeau compte à droite d’un titre, ou sort à gauche d’un document', () => {
    expect(html(h(Flag, { tone: 2 }, 8))).toBe('<span class="tag c2">8</span>');
    expect(html(h(Flag, { tone: 3, side: 'left' }, 3))).toBe(
      '<span class="flag flag--left c3">3</span>',
    );
  });

  it('trois traits, cachés aux lecteurs d’écran ; « Leon lit » est un statut', () => {
    expect(html(h(Strokes)).match(/<i><\/i>/g)).toHaveLength(3);
    expect(html(h(Strokes))).toContain('aria-hidden="true"');
    expect(html(h(Reading, null, 'Leon is reading…'))).toContain('role="status"');
  });

  it('le numéro d’une source est un bouton ou un lien dans sa couleur ; « sans source » se dit', () => {
    expect(html(h(CitationChip, { n: 3, label: 'Source 3' }))).toMatch(
      /^<button type="button" aria-label="Source 3" title="Source 3" class="cite c3">3<\/button>$/,
    );
    expect(html(h(CitationChip, { n: 5, label: 'Source 5', href: '#s5', active: true }))).toMatch(
      /^<a [^>]*data-active="true" class="cite c1" href="#s5">5<\/a>$/,
    );
    expect(html(h(SourceNumber, { n: 4 }))).toBe('<span class="num c4">4</span>');
    expect(html(h(NoSource))).toBe('<span class="nosrc">no source</span>');
  });

  it('le logo d’un outil ou d’un fichier à sa taille ; une icône de repli pour le reste', () => {
    expect(html(h(ToolLogo, { kind: 'gmail', size: 28 }))).toContain('src="/logos/gmail.svg"');
    expect(html(h(ToolLogo, { kind: 'pdf' }))).toContain('src="/logos/pdf.svg"');
    for (const kind of ['codex', 'nouvel_outil', '', 'constructor', '__proto__']) {
      const out = html(h(ToolLogo, { kind }));
      expect(out, JSON.stringify(kind)).toContain('<svg');
      expect(out, JSON.stringify(kind)).not.toContain('<img');
    }
  });
});

describe('Section, PageHeader, Badge', () => {
  it('la section porte son drapeau compteur, et ses outils à droite', () => {
    const out = html(
      h(Section, { id: 'outils', title: 'Connected', count: 8, actions: 'search', children: 'x' }),
    );
    expect(out).toContain('<section id="outils" aria-labelledby="outils-titre"');
    expect(out).toContain('<span class="tag c2">8</span>');
    expect(html(h(Section, { title: 'Plain', children: 'x' }))).not.toContain('class="tag');
  });

  it('l’en-tête ne dessine plus rien sous le titre, sans casser ses appelants', () => {
    const out = html(
      h(PageHeader, { title: 'Team', subtitle: 'A sentence', meta: 'Meta', actions: 'pill' }),
    );
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('pill');
    expect(out).not.toContain('A sentence');
    expect(out).not.toContain('Meta');
  });

  it('la pastille d’état a son point : vert quand tout va, rouge quand rien ne va, aucun pour un simple mot', () => {
    expect(html(h(Badge, { tone: 'success' }, 'Synced'))).toContain('bg-ok');
    expect(html(h(Badge, { tone: 'destructive' }, 'Disconnected'))).toContain(
      'rounded-full bg-destructive"',
    );
    expect(html(h(Badge, null, 'Invited'))).not.toContain('size-1.5');
  });
});

describe('SearchField, OriginalSheet, le corps du panneau', () => {
  it('le champ de recherche a son nom, et annonce la touche « / »', () => {
    const out = html(h(SearchField, { label: 'Search tools' }));
    expect(out).toContain('type="search"');
    expect(out).toMatch(/<label for="([^"]+)" class="sr-only">Search tools<\/label><input id="\1"/);
    expect(out).toContain('placeholder="Search tools"');
    expect(out).toContain('>/</kbd>');
    expect(html(h(SearchField, { label: 'Search', slash: false }))).not.toContain('<kbd');
  });

  it('l’original est une feuille dans son puits : drapeau à gauche, mots en sérif, passage dans la couleur de la source', () => {
    const out = html(
      h(OriginalSheet, { n: 2, meta: 'HubSpot · Quote' }, h('p', null, h('mark', null, 'Nov 15'))),
    );
    expect(out).toMatch(/^<div class="well"><article class="doc c2">/);
    expect(out).toContain('<span class="flag flag--left c2">2</span>');
    expect(out).toContain('<p class="doc__meta">HubSpot · Quote</p>');
    expect(out).toContain('<div class="doc__body"><p><mark>Nov 15</mark></p></div>');
    expect(html(h(OriginalSheet, null, 'x'))).not.toContain('flag--left');
  });

  it('les faits sont une liste de définitions ; « fait » est un statut sous son trait', () => {
    const facts = html(h(Facts, null, h(Fact, { label: 'Account' }, 'julie@kestrel.example')));
    expect(facts).toBe(
      '<dl class="facts"><div><dt>Account</dt><dd>julie@kestrel.example</dd></div></dl>',
    );
    expect(html(h(StatusRow, null, 'x'))).toBe('<div class="statusrow">x</div>');
    const done = html(
      h(PanelDone, { title: 'Outlook is connected' }, 'The first sync starts within a minute.'),
    );
    expect(done).toContain('role="status"');
    expect(done).toContain('<span class="mark is-on">Outlook is connected</span>');
  });

  it('fermé, le panneau ne dessine rien (Radix le monte dans un portail à l’ouverture)', () => {
    expect(
      html(h(SidePanel, { open: false, onOpenChange: () => {}, title: 'Gmail', children: 'x' })),
    ).toBe('');
  });
});
