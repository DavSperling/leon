import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FicheLine } from '@/server/portrait/fiche';
import type { Proposal } from '@/server/portrait/propositions';
import type { FicheBrouillon, FicheScreen } from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { errorOf, FicheSection } from './fiche';

// Les actions importent Better Auth : seul le dessin de l'onglet se teste ici, et la décision pure qu'il prend d'une
// erreur. Données inventées : des sources qui n'existent pas.
vi.mock('@/app/(app)/settings/actions', () => ({
  answerAgentAction: vi.fn(),
  buildFicheAction: vi.fn(),
  correctFicheLineAction: vi.fn(),
  discardBrouillonAction: vi.fn(),
  retireFicheLineAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const DAY = new Date('2026-11-10T09:00:00Z');
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
let next = 0;
const line = (
  genre: 'role' | 'tache',
  cle: string,
  valeur: FicheLine['valeur'],
  over: Partial<FicheLine> = {},
): FicheLine => ({
  id: id(++next),
  genre,
  cle,
  valeur,
  provenance: 'synthese',
  mails: null,
  corrigeeLe: null,
  ...over,
});

const [SEEN, UNLINKED, GONE] = [id(901), id(902), id(903)];

const ROLE = line('role', '', { texte: 'Commerciale : suit les clients\net prépare les devis.' });
const TACHE = line('tache', '1', {
  titre: 'Répondre aux demandes de devis',
  detail: 'Un client demande un prix ; elle répond avec un devis.',
  sources: [SEEN, UNLINKED, GONE],
});
// Corrigée par elle, et sans aucune source qu'elle voie encore.
const TACHE_CORRIGEE = line(
  'tache',
  '2',
  { titre: 'Relancer les devis', detail: '', sources: [GONE] },
  { provenance: 'personne', corrigeeLe: DAY },
);

// Les lignes dans un ordre quelconque : l'écran les range.
const LINES = [TACHE_CORRIGEE, TACHE, ROLE];
const DATA: FicheScreen = {
  etat: 'faite',
  lines: LINES,
  sources: {
    [SEEN]: { title: 'Demande de devis', url: 'https://app.hubspot.test/deal/1', kind: 'hubspot' },
    [UNLINKED]: { title: null, url: null, kind: 'gmail' },
  },
  agents: [],
  brouillons: [],
};

const render = (data: FicheScreen | null = DATA, locale: 'en' | 'fr' = 'fr') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(FicheSection, { data }),
    }),
  );
// Le texte de l'écran, espaces fines et insécables ramenées à une espace.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[\s  ]+/g, ' ');
// La ligne de la fiche, reconnue à ses mots : jusqu'à la ligne suivante, ou la fin de sa partie.
const row = (html: string, one: FicheLine) =>
  html
    .split('<li class="px-3')
    .find((part) => part.includes(`id="ligne-${one.id}"`))
    ?.split('</section>')[0] ?? '';
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('errorOf : ce que l’onglet dit d’une erreur des actions', () => {
  it('une ligne introuvable, une valeur refusée, et tout le reste', () => {
    expect(errorOf('introuvable')).toBe('errorNotFound');
    expect(errorOf('invalide')).toBe('errorInvalid');
    expect(errorOf('echec')).toBe('errorFailed');
  });
});

describe('FicheSection : la fiche en mots', () => {
  it('dit que la fiche n’est visible que de la personne, dans les deux langues', () => {
    expect(text(render())).toContain(
      'Vous seul voyez cette fiche : ni votre manager, ni un administrateur, ni un agent d’équipe ne la lisent.',
    );
    expect(text(render(DATA, 'en'))).toContain(
      'Only you can see this profile: not your manager, not an administrator, not a team agent.',
    );
  });

  it('dit que Leon garde aussi des mesures sur ses mails, sans les afficher', () => {
    expect(text(render())).toContain(
      'Leon garde aussi, sans les afficher, des mesures sur vos mails envoyés',
    );
    expect(text(render(DATA, 'en'))).toContain(
      'Leon also keeps measurements from your sent email without showing them',
    );
  });

  it('ne montre que deux parties, dans l’ordre : son rôle, puis ses tâches', () => {
    const html = render();
    const titles = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

    expect(titles).toEqual(['Ma fiche', 'Rôle', 'Tâches répétées']);
  });

  it('ne montre jamais une valeur brute : ni JSON, ni nom de champ', () => {
    const shown = text(render());

    expect(shown).not.toMatch(/[{}[\]]/);
    for (const field of ['detail', 'sources', 'texte']) expect(shown, field).not.toContain(field);
  });

  it('le rôle se lit tel quel, sur ses lignes', () => {
    const role = row(render(), ROLE);

    expect(role).toContain('Commerciale : suit les clients\net prépare les devis.');
    expect(role).toContain('whitespace-pre-wrap');
  });

  it('une tâche : son titre, son détail, et « vue dans N éléments » pour les seules sources qu’elle voit encore', () => {
    const html = render();
    const tache = row(html, TACHE);

    expect(text(tache)).toContain('Répondre aux demandes de devis');
    expect(text(tache)).toContain('Un client demande un prix ; elle répond avec un devis.');
    // Trois sources dans la ligne, deux qu'elle voit encore : la troisième n'est ni comptée ni montrée.
    expect(text(tache)).toContain('Vue dans 2 éléments');
    expect(tache).toContain('aria-expanded="false"');
    expect(count(tache, 'class="tl ')).toBe(2);
    // Une source avec son lien mène à son outil ; sans lien, elle se montre sans s'ouvrir.
    expect(tache).toContain('href="https://app.hubspot.test/deal/1"');
    expect(tache).toContain('target="_blank" rel="noopener noreferrer"');
    expect(text(tache)).toContain('Demande de devis');
    expect(text(tache)).toContain('HubSpot');
    expect(text(tache)).toContain('Sans titre');
    expect(text(tache)).toContain('Gmail');
    expect(tache).toMatch(/<button [^>]*disabled=""/);
  });

  it('une tâche dont aucune source n’est plus visible ne dit pas « vue dans »', () => {
    const tache = row(render(), TACHE_CORRIGEE);

    expect(text(tache)).toContain('Relancer les devis');
    expect(text(tache)).not.toContain('Vue dans');
  });

  it('les tâches suivent leur rang', () => {
    const html = render();

    expect(html.indexOf(`ligne-${TACHE.id}`)).toBeLessThan(
      html.indexOf(`ligne-${TACHE_CORRIGEE.id}`),
    );
  });

  it('chaque ligne dit d’où elle vient : écrite par Leon, ou corrigée par elle avec la date', () => {
    const html = render();

    expect(text(row(html, ROLE))).toContain('Écrite par Leon d’après vos outils');
    expect(text(row(html, TACHE))).toContain('Écrite par Leon d’après vos outils');
    expect(text(row(html, TACHE_CORRIGEE))).toContain('Corrigée par vous le 10 nov. 2026');
    expect(row(html, TACHE_CORRIGEE)).toContain('dateTime="2026-11-10T09:00:00.000Z"');
  });

  it('chaque ligne se corrige et se retire', () => {
    const html = render();

    for (const one of LINES) expect(row(html, one), one.genre).toContain(`id="corriger-${one.id}"`);
    expect(count(html, '>Corriger</button>')).toBe(LINES.length);
    expect(count(html, '>Retirer</button>')).toBe(LINES.length);
  });

  it('relie « Corriger », « Retirer » et les sources aux mots de leur ligne', () => {
    const html = render();

    expect(html).toContain(`id="ligne-${TACHE.id}"`);
    // « Corriger », « Retirer » et « Vue dans 2 éléments ».
    expect(count(html, `aria-describedby="ligne-${TACHE.id}"`)).toBe(3);
    expect(html).toContain(`aria-controls="sources-${TACHE.id}"`);
    expect(count(html, `aria-describedby="ligne-${ROLE.id}"`)).toBe(2);
  });

  it('se dessine en anglais avec les mêmes clés', () => {
    const shown = text(render(DATA, 'en'));

    for (const words of [
      'Work profile',
      'Role',
      'Recurring tasks',
      'Seen in 2 items',
      'Written by Leon from your tools',
      'Corrected by you on Nov 10, 2026',
    ])
      expect(shown).toContain(words);
  });
});

describe('FicheSection : les agents proposés', () => {
  // Trois propositions, dans l'ordre reçu : sans réponse, un oui, un non. Le premier est le seul en service.
  const AGENTS: Proposal[] = [
    { agent: 'brouillon-reponse', oui: null, enService: true },
    { agent: 'relance', oui: true, enService: false },
    { agent: 'point-du-jour', oui: false, enService: false },
  ];
  const WITH_AGENTS = { ...DATA, agents: AGENTS };
  // La ligne d'un agent, reconnue à ses mots, jusqu'à la suivante ou la fin de la partie.
  const agent = (html: string, id: Proposal['agent']) =>
    html
      .split('<li class="px-3')
      .find((part) => part.includes(`id="agent-${id}"`))
      ?.split('</section>')[0] ?? '';
  // Les boutons d'une ligne et leur état : [« Oui », enfoncé ?], [« Non », enfoncé ?].
  const buttons = (html: string) =>
    [
      ...html.matchAll(
        /<button [^>]*aria-pressed="(true|false)"[^>]*>(?:<svg.*?<\/svg>)?([^<]+)</g,
      ),
    ].map((match) => [match[2], match[1] === 'true']);

  it('sans proposition, la partie ne se montre pas', () => {
    const shown = text(render());

    expect(shown).not.toContain('Agents proposés');
    expect(shown).not.toMatch(/en service/i);
    expect(render()).not.toContain('aria-pressed');
  });

  it('avec des propositions, la partie vient après les tâches, et sa phrase dit vrai dans les deux langues', () => {
    const html = render(WITH_AGENTS);
    const titles = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

    expect(titles).toEqual(['Ma fiche', 'Rôle', 'Tâches répétées', 'Agents proposés']);
    expect(text(html)).toContain(
      'Répondez oui ou non à chacun : Leon garde votre réponse, et vous pouvez en changer. Un agent en service ne travaille pour vous qu’après votre oui.',
    );
    // La phrase ne dit plus que tous attendent : chaque agent dit son état.
    expect(text(html)).not.toContain('Ces agents ne sont pas encore en service');
    const english = text(render(WITH_AGENTS, 'en'));
    expect(english).toContain('Suggested agents');
    expect(english).toContain(
      'Answer yes or no to each: Leon keeps your answer, and you can change it. An agent that is running only works for you after your yes.',
    );
    expect(english).not.toContain('These agents aren’t running yet');
  });

  it('chaque agent dit vrai sur son état : « Brouillons de réponse » est en service, les autres pas encore, dans les deux langues', () => {
    const all: Proposal[] = [
      { agent: 'suite-reunion', oui: null, enService: false },
      { agent: 'brouillon-reponse', oui: true, enService: true },
      { agent: 'brief-rendez-vous', oui: null, enService: false },
      { agent: 'relance', oui: null, enService: false },
      { agent: 'point-du-jour', oui: false, enService: false },
    ];
    const states = (locale: 'fr' | 'en', running: string, notYet: string) => {
      const html = render({ ...DATA, agents: all }, locale);
      return all.map((one) => {
        const shown = text(agent(html, one.agent));
        return [one.agent, shown.includes(notYet) ? 'pas encore' : shown.includes(running)];
      });
    };
    const expected = [
      ['suite-reunion', 'pas encore'],
      ['brouillon-reponse', true],
      ['brief-rendez-vous', 'pas encore'],
      ['relance', 'pas encore'],
      ['point-du-jour', 'pas encore'],
    ];

    expect(states('fr', 'En service', 'Pas encore en service')).toEqual(expected);
    expect(states('en', 'Running', 'Not running yet')).toEqual(expected);
    // Sa phrase dit ce que son « oui » autorise : un brouillon déposé dans sa boîte Gmail, jamais envoyé.
    const html = render({ ...DATA, agents: all });
    expect(text(html)).toContain(
      'un brouillon écrit comme vous, sur cette page. Avec Gmail, un brouillon complet est aussi déposé dans vos brouillons. Jamais envoyé.',
    );
    expect(text(render({ ...DATA, agents: all }, 'en'))).toContain(
      'a draft written the way you write, on this page. With Gmail, a complete draft is also saved to your drafts. Never sent.',
    );
  });

  it('une fiche sans rôle ni tâche montre quand même ses propositions', () => {
    const html = render({
      etat: 'a-completer',
      lines: [],
      sources: {},
      agents: AGENTS,
      brouillons: [],
    });

    expect(html).toContain('>Agents proposés</h2>');
    expect(html).not.toContain('>Rôle</h2>');
  });

  it('chaque agent : son nom, sa phrase et son état, dans l’ordre reçu, et rien d’autre que « Oui » et « Non »', () => {
    const html = render(WITH_AGENTS);
    // Tout le texte de la ligne, sans la fin de sa balise ouvrante.
    const words = (id: Proposal['agent']) =>
      text(agent(html, id))
        .replace(/^[^>]*>/, '')
        .trim();

    // Ni raison ni mesure : le nom, la phrase, l'état, les deux boutons.
    expect(words('brouillon-reponse')).toBe(
      'Brouillons de réponse Quand un mail attend une réponse, un brouillon écrit comme vous, sur cette page. Avec Gmail, un brouillon complet est aussi déposé dans vos brouillons. Jamais envoyé. En service Oui Non',
    );
    expect(words('relance')).toBe(
      'Relances Quand un mail envoyé reste sans réponse, le fil remonte avec un brouillon de relance. Pas encore en service Oui Non',
    );
    expect(words('point-du-jour')).toBe(
      'Point du jour Chaque matin, votre agenda, les mails qui attendent, vos tâches. Pas encore en service Oui Non',
    );
    expect(html.indexOf('id="agent-brouillon-reponse"')).toBeLessThan(
      html.indexOf('id="agent-relance"'),
    );
    expect(html.indexOf('id="agent-relance"')).toBeLessThan(
      html.indexOf('id="agent-point-du-jour"'),
    );
    // Les agents qui ne lui sont pas proposés ne se montrent pas.
    expect(text(html)).not.toMatch(/Suite de réunion|Brief avant rendez-vous/);
  });

  it('l’état des boutons montre la réponse enregistrée : aucun avant sa réponse, « Oui » ou « Non » ensuite', () => {
    const html = render(WITH_AGENTS);

    expect(buttons(agent(html, 'brouillon-reponse'))).toEqual([
      ['Oui', false],
      ['Non', false],
    ]);
    expect(buttons(agent(html, 'relance'))).toEqual([
      ['Oui', true],
      ['Non', false],
    ]);
    expect(buttons(agent(html, 'point-du-jour'))).toEqual([
      ['Oui', false],
      ['Non', true],
    ]);
    // Les deux boutons restent actifs : elle peut changer d'avis.
    expect(agent(html, 'relance')).not.toContain('disabled');
  });

  it('relie « Oui » et « Non » aux mots de leur agent', () => {
    const html = render(WITH_AGENTS);

    for (const one of AGENTS)
      expect(count(html, `aria-describedby="agent-${one.agent}"`), one.agent).toBe(2);
  });

  it('se dessine en anglais avec les mêmes clés, pour les cinq agents du catalogue', () => {
    const all: Proposal[] = [
      { agent: 'suite-reunion', oui: null, enService: false },
      { agent: 'brouillon-reponse', oui: true, enService: true },
      { agent: 'brief-rendez-vous', oui: null, enService: false },
      { agent: 'relance', oui: null, enService: false },
      { agent: 'point-du-jour', oui: false, enService: false },
    ];
    const html = render({ ...DATA, agents: all }, 'en');

    for (const words of [
      'Meeting follow-up',
      'Reply drafts',
      'Pre-meeting brief',
      'Follow-ups',
      'Daily brief',
      'After a recorded meeting, a summary and a draft follow-up email.',
    ])
      expect(text(html)).toContain(words);
    expect(buttons(agent(html, 'brouillon-reponse'))).toEqual([
      ['Yes', true],
      ['No', false],
    ]);
    // Aucune clé de traduction ne se montre à la place d'un texte.
    expect(text(html)).not.toMatch(/fiche\.|agents\./);
    expect(text(render({ ...DATA, agents: all }))).not.toMatch(/fiche\.|agents\./);
  });
});

describe('FicheSection : les brouillons prêts', () => {
  const DEVIS: FicheBrouillon = {
    id: id(701),
    from: 'Léa Roy',
    receivedAt: new Date('2026-11-20T08:30:00Z'),
    texte: 'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] <b>.\n\nBien à vous',
    depose: false,
    source: { title: 'Devis 2027', url: 'https://mail.google.test/fil/1', kind: 'gmail' },
  };
  // Un fil sans objet ni lien, d'un correspondant sans nom.
  const SANS_LIEN: FicheBrouillon = {
    id: id(702),
    from: 'marc@client.test',
    receivedAt: new Date('2026-11-19T08:30:00Z'),
    texte: 'Bonjour,\n\nBien reçu.',
    depose: false,
    source: { title: null, url: null, kind: 'outlook' },
  };
  // Complet : déposé aussi dans ses brouillons Gmail.
  const DEPOSE: FicheBrouillon = {
    id: id(703),
    from: 'Léa Roy',
    receivedAt: new Date('2026-11-18T08:30:00Z'),
    texte: 'Bonjour Léa,\n\nC’est entendu.',
    depose: true,
    source: { title: 'Contrat', url: 'https://mail.google.test/fil/3', kind: 'gmail' },
  };
  const WITH_DRAFTS = { ...DATA, brouillons: [DEVIS, SANS_LIEN] };
  const draft = (html: string, one: FicheBrouillon) =>
    html
      .split('<li class="px-3')
      .find((part) => part.includes(`id="brouillon-${one.id}"`))
      ?.split('</section>')[0] ?? '';

  it('sans brouillon, la partie ne se montre pas', () => {
    const html = render();

    expect(text(html)).not.toMatch(/Brouillons prêts|Rien n’est envoyé|Écarter/);
    expect(html).not.toContain('>Copier<');
  });

  it('avec des brouillons, la partie vient en tête, avant le rôle, et sa phrase dit ce qui va dans sa boîte, dans les deux langues', () => {
    const html = render(WITH_DRAFTS);
    const titles = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

    expect(titles).toEqual(['Ma fiche', 'Brouillons prêts', 'Rôle', 'Tâches répétées']);
    // Rien n'est envoyé ; un brouillon complet est aussi dans ses brouillons Gmail, où « Écarter » ne touche à rien.
    expect(text(html)).toContain(
      'Rien n’est envoyé. Avec Gmail, un brouillon complet est aussi déposé dans vos brouillons ; les autres se copient d’ici. Écarter un brouillon ne le retire pas de Gmail.',
    );
    expect(text(html)).not.toContain('ni écrit dans votre boîte');
    const english = text(render(WITH_DRAFTS, 'en'));
    expect(english).toContain('Drafts ready');
    expect(english).toContain(
      'Nothing is sent. With Gmail, a complete draft is also saved to your drafts; copy the others from here. Dismissing a draft doesn’t remove it from Gmail.',
    );
  });

  it('une fiche sans rôle ni tâche montre quand même ses brouillons', () => {
    const html = render({
      etat: 'a-completer',
      lines: [],
      sources: {},
      agents: [],
      brouillons: [DEVIS],
    });

    expect(html).toContain('>Brouillons prêts</h2>');
    expect(html).not.toContain('>Rôle</h2>');
  });

  it('chaque brouillon : le correspondant, la date du mail reçu, le fil lié à son outil, le texte tel quel, « Copier » et « Écarter »', () => {
    const html = render(WITH_DRAFTS);
    const devis = draft(html, DEVIS);

    expect(text(devis)).toContain('Léa Roy');
    expect(text(devis)).toContain('Reçu le 20 nov. 2026');
    expect(devis).toContain('dateTime="2026-11-20T08:30:00.000Z"');
    // Le fil, comme les sources d'une tâche : son objet, son outil, et son lien vers l'outil.
    expect(devis).toContain('href="https://mail.google.test/fil/1"');
    expect(devis).toContain('target="_blank" rel="noopener noreferrer"');
    expect(text(devis)).toContain('Devis 2027');
    expect(text(devis)).toContain('Gmail');
    // Le texte tel quel : ses lignes, ses crochets, et rien qui s'interprète.
    expect(devis).toContain(
      'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] &lt;b&gt;.\n\nBien à vous',
    );
    expect(devis).toMatch(/<p class="[^"]*whitespace-pre-wrap[^"]*">Bonjour Léa,/);
    // Deux gestes, pas un de plus : ni corriger, ni refaire, ni envoyer.
    expect(
      [...devis.matchAll(/<button [^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map((m) => m[1]),
    ).toEqual(['Copier', 'Écarter']);
    expect(html.indexOf(`brouillon-${DEVIS.id}`)).toBeLessThan(
      html.indexOf(`brouillon-${SANS_LIEN.id}`),
    );
  });

  it('un brouillon déposé le dit, lui seul, dans les deux langues, sans geste de plus', () => {
    const data = { ...DATA, brouillons: [DEVIS, DEPOSE, SANS_LIEN] };
    const html = render(data);
    const english = render(data, 'en');

    expect(text(draft(html, DEPOSE))).toContain('Déposé dans vos brouillons Gmail');
    expect(text(draft(english, DEPOSE))).toContain('Saved to your Gmail drafts');
    for (const one of [DEVIS, SANS_LIEN]) {
      expect(text(draft(html, one)), one.id).not.toContain('Déposé');
      expect(text(draft(english, one)), one.id).not.toContain('Saved to');
    }
    // La mention fait partie des mots du brouillon, que « Copier » et « Écarter » rappellent.
    expect(draft(html, DEPOSE)).toMatch(
      new RegExp(`id="brouillon-${DEPOSE.id}"[^]*Déposé dans vos brouillons Gmail</p></div>`),
    );
    expect(
      [...draft(html, DEPOSE).matchAll(/<button [^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map(
        (m) => m[1],
      ),
    ).toEqual(['Copier', 'Écarter']);
  });

  it('un fil sans objet ni lien se montre sans s’ouvrir, et un correspondant sans nom par son adresse', () => {
    const sansLien = draft(render(WITH_DRAFTS), SANS_LIEN);

    expect(text(sansLien)).toContain('marc@client.test');
    expect(text(sansLien)).toContain('Sans titre');
    expect(text(sansLien)).toContain('Outlook');
    expect(sansLien).not.toContain('href=');
    expect(sansLien).toMatch(/<button [^>]*disabled=""/);
  });

  it('relie « Copier » et « Écarter » aux mots de leur brouillon', () => {
    const html = render(WITH_DRAFTS);

    for (const one of [DEVIS, SANS_LIEN])
      expect(count(html, `aria-describedby="brouillon-${one.id}"`), one.id).toBe(2);
  });

  it('se dessine en anglais avec les mêmes clés', () => {
    const html = render(WITH_DRAFTS, 'en');
    const shown = text(html);

    for (const words of ['Drafts ready', 'Received on Nov 20, 2026', 'Untitled', 'Dismiss'])
      expect(shown).toContain(words);
    expect(html).toContain('>Copy<');
    expect(shown).not.toMatch(/fiche\.|common\./);
  });
});

describe('FicheSection : où en est la construction', () => {
  const EMPTY = { lines: [], sources: {}, agents: [], brouillons: [] };

  it('sans fiche ni boîte : il en faut une, avec le lien vers les connexions, et pas de bouton', () => {
    const html = render({ etat: 'sans-boite', ...EMPTY });

    expect(text(html)).toContain('Vous n’avez pas encore de fiche.');
    expect(text(html)).toContain('Branchez d’abord votre boîte Gmail ou Outlook.');
    expect(html).toMatch(/<a [^>]*href="\/connections"[^>]*>Ouvrir les connexions<\/a>/);
    expect(text(html)).not.toContain('Construire ma fiche');
  });

  it('sans fiche, avec une boîte : le bouton « Construire ma fiche »', () => {
    const html = render({ etat: 'a-construire', ...EMPTY });

    expect(html).toMatch(/<button [^>]*>(<[^>]+>)*Construire ma fiche/);
    expect(html).not.toContain('href="/connections"');
    // La fiche ne se refait pas : une boîte tout juste branchée doit d'abord être lue.
    expect(text(html)).toContain('laissez d’abord à Leon le temps de la lire');
  });

  it('une construction finie sans aucun mail trouvé : l’écran le dit, et le bouton reste', () => {
    const html = render({ etat: 'sans-mail', ...EMPTY });

    expect(text(html)).toContain('Leon n’a trouvé aucun mail que vous avez envoyé');
    expect(text(render({ etat: 'sans-mail', ...EMPTY }, 'en'))).toContain('Leon found no email');
    expect(html).toMatch(/<button [^>]*>(<[^>]+>)*Construire ma fiche/);
  });

  it('construction demandée ou en cours : l’écran le dit, annoncé, sans bouton pour la relancer', () => {
    const html = render({ etat: 'en-cours', ...EMPTY });

    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Leon construit votre fiche.');
    expect(text(html)).toContain('Actualiser');
    expect(text(html)).not.toMatch(/Construire ma fiche|Compléter ma fiche/);
  });

  it('mesures calculées, sans rôle ni tâche : rien à montrer encore, et le bouton reste pour la compléter', () => {
    const html = render({ etat: 'a-completer', ...EMPTY });

    expect(text(html)).toContain('Leon n’a pas encore écrit votre rôle ni vos tâches répétées.');
    expect(html).toMatch(/<button [^>]*>(<[^>]+>)*Compléter ma fiche/);
    expect(html).not.toContain('>Rôle</h2>');
    expect(html).not.toContain('<li');
  });

  it('une fois le rôle ou les tâches écrits : plus de bouton', () => {
    const shown = text(render());

    expect(shown).not.toMatch(/Construire ma fiche|Compléter ma fiche|Leon construit/);
  });

  it('une lecture en échec : une erreur annoncée, aucune ligne', () => {
    const html = render(null);

    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Impossible de charger votre fiche');
    expect(html).not.toContain('<li');
  });
});
