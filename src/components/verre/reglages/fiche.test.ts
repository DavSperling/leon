import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FicheLine } from '@/server/portrait/fiche';
import type { FicheScreen } from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { errorOf, FicheSection } from './fiche';

// Les actions importent Better Auth : seul le dessin de l'onglet se teste ici, et la décision pure qu'il prend d'une
// erreur. Données inventées : des adresses en .test, des sources qui n'existent pas.
vi.mock('@/app/(app)/settings/actions', () => ({
  buildFicheAction: vi.fn(),
  correctFicheLineAction: vi.fn(),
  retireFicheLineAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const DAY = new Date('2026-11-10T09:00:00Z');
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
let next = 0;
const line = (
  genre: FicheLine['genre'],
  cle: string,
  valeur: FicheLine['valeur'],
  over: Partial<FicheLine> = {},
): FicheLine => ({
  id: id(++next),
  genre,
  cle,
  valeur,
  provenance: genre === 'role' || genre === 'tache' ? 'synthese' : 'calcul',
  mails: genre === 'role' || genre === 'tache' ? null : 12,
  corrigeeLe: null,
  ...over,
});

const [SEEN, UNLINKED, GONE] = [id(901), id(902), id(903)];
// 24 heures à zéro, sauf la matinée et le début d'après-midi.
const HEURES = Array.from({ length: 24 }, (_, hour) => ({ 9: 6, 10: 10, 11: 5, 14: 8 })[hour] ?? 0);

const ROLE = line('role', '', { texte: 'Commerciale : suit les clients et prépare les devis.' });
const TACHE = line('tache', '1', {
  titre: 'Répondre aux demandes de devis',
  detail: 'Un client demande un prix ; elle répond avec un devis.',
  sources: [SEEN, UNLINKED, GONE],
});
const TACHE_SANS_SOURCE = line('tache', '2', {
  titre: 'Relancer les devis',
  detail: '',
  sources: [GONE],
});
const PAUL = line('interlocuteur', 'paul@acme.test', {
  a: 10,
  copie: 2,
  dernier: DAY.toISOString(),
  type: 'interne',
  registre: 'tutoiement',
  tutoiement: 4,
  vouvoiement: 0,
});
const LEA = line(
  'interlocuteur',
  'lea@client.test',
  {
    a: 30,
    copie: 0,
    dernier: DAY.toISOString(),
    type: null,
    registre: null,
    tutoiement: 0,
    vouvoiement: 0,
  },
  { provenance: 'personne', mails: null, corrigeeLe: DAY },
);
const STYLE = (side: string) => [
  line('appels', side, {
    formules: [
      { formule: 'Bonjour', mails: 9 },
      { formule: 'Salut', mails: 1 },
    ],
  }),
  line('politesses', side, { formules: [{ formule: 'Cordialement', mails: 8 }] }),
  line('registre', side, { tutoiement: 0.25, vouvoiement: 0.75 }),
  line('mots', side, { mediane: 84.5 }),
];
const RYTHME = [
  line('rythme', '', { mailsParSemaine: 12.5 }),
  line('horaires', '', { heures: HEURES, jours: [10, 9, 2, 8, 1, 0, 0] }),
  line('delai-reponse', '', {
    tous: { medianeMinutes: 150, reponses: 20 },
    interne: { medianeMinutes: 30, reponses: 12 },
    externe: { medianeMinutes: null, reponses: 0 },
  }),
  line('langues', '', { fr: 90, en: 10, autre: 0, inconnue: 0 }),
];
const SIGNATURE = line('signature', '', { texte: 'Julie Martin\nAcme' });

// Les lignes dans un ordre quelconque : l'écran les range.
const LINES = [SIGNATURE, ...RYTHME, ...STYLE('tous'), PAUL, LEA, TACHE_SANS_SOURCE, TACHE, ROLE];
const DATA: FicheScreen = {
  etat: 'faite',
  lines: LINES,
  sources: {
    [SEEN]: { title: 'Demande de devis', url: 'https://app.hubspot.test/deal/1', kind: 'hubspot' },
    [UNLINKED]: { title: null, url: null, kind: 'gmail' },
  },
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

  it('range les parties dans l’ordre : rôle, tâches, interlocuteurs, façon d’écrire, rythme, signature', () => {
    const html = render();
    const order = [
      'Rôle',
      'Tâches répétées',
      'Interlocuteurs',
      'Façon d’écrire',
      'Rythme',
      'Signature',
    ].map((title) => html.indexOf(`>${title}</h2>`));

    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it('ne montre jamais une valeur brute : ni JSON, ni nom de champ, ni 24 nombres', () => {
    const shown = text(render());

    expect(shown).not.toMatch(/[{}[\]]/);
    for (const field of ['mailsParSemaine', 'medianeMinutes', 'formules', 'reponses', 'inconnue'])
      expect(shown, field).not.toContain(field);
  });

  it('le rôle et la signature se lisent tels quels, la signature sur ses lignes', () => {
    const html = render();

    expect(text(row(html, ROLE))).toContain('Commerciale : suit les clients et prépare les devis.');
    expect(row(html, SIGNATURE)).toContain('Julie Martin\nAcme');
    expect(row(html, SIGNATURE)).toContain('whitespace-pre-wrap');
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
    const tache = row(render(), TACHE_SANS_SOURCE);

    expect(text(tache)).toContain('Relancer les devis');
    expect(text(tache)).not.toContain('Vue dans');
  });

  it('les tâches suivent leur rang, les interlocuteurs le nombre de mails', () => {
    const html = render();

    expect(html.indexOf(`ligne-${TACHE.id}`)).toBeLessThan(
      html.indexOf(`ligne-${TACHE_SANS_SOURCE.id}`),
    );
    expect(html.indexOf(`ligne-${LEA.id}`)).toBeLessThan(html.indexOf(`ligne-${PAUL.id}`));
  });

  it('un interlocuteur : son adresse, ses mails, interne ou externe et le registre quand on les sait', () => {
    const html = render();

    expect(text(row(html, PAUL))).toContain('paul@acme.test 12 mails · interne · tutoiement');
    const lea = text(row(html, LEA));
    expect(lea).toContain('lea@client.test 30 mails');
    expect(lea).not.toMatch(/interne|externe|tutoiement|vouvoiement/);
  });

  it('la façon d’écrire : formules d’appel, de politesse, registre et longueur, en phrases', () => {
    const shown = text(render());

    expect(shown).toContain('Formules d’appel : Bonjour (9 mails), Salut (1 mail)');
    expect(shown).toContain('Formules de politesse : Cordialement (8 mails)');
    expect(shown).toContain('Tutoiement dans 25 % de vos mails, vouvoiement dans 75 %');
    expect(shown).toContain('Longueur habituelle : environ 85 mots');
  });

  it('par type de destinataire seulement quand il y en a plusieurs', () => {
    const one = render();
    expect(one).not.toContain('<h3');

    const several = render({
      ...DATA,
      lines: [...STYLE('externe'), ...LINES, ...STYLE('interne')],
    });
    const titles = ['Tous vos mails', 'À vos collègues', 'À l’extérieur'].map((title) =>
      several.indexOf(`>${title}</h3>`),
    );
    expect(titles.every((at) => at > 0)).toBe(true);
    expect(titles).toEqual(titles.toSorted((a, b) => a - b));
  });

  it('le rythme : mails par semaine, plages et jours les plus chargés, délai de réponse, langues', () => {
    const shown = text(render());

    expect(shown).toContain('12,5 mails par semaine');
    expect(shown).toContain(
      'Vous envoyez surtout vos mails de 9 h à 12 h et de 14 h à 15 h (heure de Paris).',
    );
    expect(shown).toContain('Vos jours les plus chargés : lundi, mardi et jeudi.');
    expect(shown).toContain('Délai de réponse habituel : environ 3 heures');
    expect(shown).toContain('À vos collègues : environ 30 minutes');
    expect(shown).not.toContain('À l’extérieur : environ');
    expect(shown).toContain('Langues de vos mails : français 90 %, anglais 10 %');
  });

  it('chaque ligne dit d’où elle vient : calculée sur N mails, écrite par Leon, ou corrigée par elle avec la date', () => {
    const html = render();

    expect(text(row(html, PAUL))).toContain('Calculée sur 12 mails');
    expect(text(row(html, ROLE))).toContain('Écrite par Leon d’après vos outils');
    expect(text(row(html, TACHE))).toContain('Écrite par Leon d’après vos outils');
    expect(text(row(html, LEA))).toContain('Corrigée par vous le 10 nov. 2026');
    expect(row(html, LEA)).toContain('dateTime="2026-11-10T09:00:00.000Z"');
  });

  it('chaque ligne se retire ; seuls le rôle, les tâches, la signature et les interlocuteurs se corrigent', () => {
    const html = render();

    expect(count(html, '>Retirer</button>')).toBe(LINES.length);
    for (const one of [ROLE, TACHE, TACHE_SANS_SOURCE, PAUL, LEA, SIGNATURE])
      expect(row(html, one), one.genre).toContain(`id="corriger-${one.id}"`);
    for (const one of [...RYTHME, ...LINES.filter((l) => l.cle === 'tous')])
      expect(row(html, one), one.genre).not.toContain('Corriger');
    expect(count(html, '>Corriger</button>')).toBe(6);
  });

  it('relie « Corriger », « Retirer » et les sources aux mots de leur ligne', () => {
    const html = render();

    expect(html).toContain(`id="ligne-${TACHE.id}"`);
    // « Corriger », « Retirer » et « Vue dans 2 éléments ».
    expect(count(html, `aria-describedby="ligne-${TACHE.id}"`)).toBe(3);
    expect(html).toContain(`aria-controls="sources-${TACHE.id}"`);
    expect(count(html, `aria-describedby="ligne-${RYTHME[0]?.id}"`)).toBe(1);
  });

  it('se dessine en anglais avec les mêmes clés', () => {
    const shown = text(render(DATA, 'en'));

    for (const words of [
      'Work profile',
      'Recurring tasks',
      'Seen in 2 items',
      '12 emails · internal · informal “tu”',
      'Greetings: Bonjour (9 emails), Salut (1 email)',
      'You mostly send email from 9 AM to 12 PM and from 2 PM to 3 PM (Paris time).',
      'Your busiest days: Monday, Tuesday, and Thursday.',
      'Usual reply time: about 3 hours',
      'Languages of your email: French 90%, English 10%',
      'Computed from 12 emails',
      'Written by Leon from your tools',
      'Corrected by you on Nov 10, 2026',
    ])
      expect(shown).toContain(words);
  });
});

describe('FicheSection : où en est la construction', () => {
  const EMPTY = { lines: [], sources: {} };
  const COMPUTED = { lines: [...RYTHME, PAUL], sources: {} };

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
  });

  it('construction demandée ou en cours : l’écran le dit, annoncé, sans bouton pour la relancer', () => {
    const html = render({ etat: 'en-cours', ...COMPUTED });

    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Leon construit votre fiche.');
    expect(text(html)).toContain('Actualiser');
    expect(text(html)).not.toMatch(/Construire ma fiche|Compléter ma fiche/);
    // Les lignes déjà calculées se montrent pendant que le modèle écrit le reste.
    expect(text(html)).toContain('12,5 mails par semaine');
  });

  it('fiche calculée sans rôle ni tâche : elle se montre, et le bouton reste pour la compléter', () => {
    const html = render({ etat: 'a-completer', ...COMPUTED });

    expect(text(html)).toContain('Leon n’a pas encore écrit votre rôle ni vos tâches répétées.');
    expect(html).toMatch(/<button [^>]*>(<[^>]+>)*Compléter ma fiche/);
    expect(text(html)).toContain('paul@acme.test');
    expect(html).not.toContain('>Rôle</h2>');
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
