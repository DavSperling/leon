import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SidePanelProps } from '@/components/verre';
import { type Flow, OTHER, startFlow } from '@/lib/draft-questions';
import { type Done, panelMails } from '@/lib/reply-drafts';
import type {
  HomeBrouillon,
  HomeDemande,
  HomeInconnu,
  HomePreference,
} from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { MailView, Questions, ReplyDrafts } from './reply-drafts';

// L'agent « Brouillons de réponse » sur l'Accueil, rendu côté serveur (pas de DOM ici, donc pas de clic) : la ligne,
// le panneau tel qu'il s'ouvre, chaque mail, et les questions de Leon dans un état donné. Passer d'un état à l'autre, et
// d'un mail à l'autre, se teste sans écran (lib/draft-questions.test.ts, lib/reply-drafts.test.ts). Les actions
// importent Better Auth : elles ne sont pas appelées au rendu. Données inventées.
vi.mock('@/app/(app)/settings/actions', () => ({
  answerPreferenceAction: vi.fn(),
  answerQuestionsAction: vi.fn(),
  answerUnknownAction: vi.fn(),
  discardBrouillonAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Le panneau du kit se monte dans un portail, que le rendu côté serveur ne dessine pas : ici, quand `view.open` le
// demande, ce qu'il porterait, tel qu'il s'ouvre. Sa confirmation ne vient qu'après un clic : le rendu ne la voit pas.
const view = vi.hoisted(() => ({ open: false }));
vi.mock('@/components/verre', async (importOriginal) => {
  const kit = await importOriginal<typeof import('@/components/verre')>();
  return {
    ...kit,
    SidePanel: ({ title, sub, children, foot }: SidePanelProps) =>
      view.open
        ? createElement(
            'div',
            { 'data-panneau': '' },
            createElement('h2', null, title),
            createElement('p', { 'data-sub': '' }, sub),
            children,
            createElement('footer', null, foot),
          )
        : null,
    PanelClose: ({ children }: { children: ReactNode }) => children,
  };
});

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const DEVIS: HomeDemande = {
  id: id(1),
  from: 'Léa Roy',
  receivedAt: new Date('2026-11-10T09:00:00Z'),
  questions: ['Acceptez-vous le rendez-vous de mardi ?', 'Quel prix lui annoncer ?'],
  choix: [
    ['Oui', 'Non, proposer jeudi'],
    ['1 200 €', '1 500 €', 'Le tarif habituel'],
  ],
  repondue: false,
  source: { title: 'Devis 2027', url: 'https://mail.google.test/2', kind: 'gmail' },
};
const CONTRAT: HomeDemande = {
  id: id(2),
  from: null,
  receivedAt: new Date('2026-11-09T09:00:00Z'),
  questions: ['Can you sign before Friday?'],
  choix: [['Yes', 'No']],
  repondue: false,
  source: { title: null, url: null, kind: 'outlook' },
};
const INES: HomeInconnu = {
  from: 'Inès Garnier',
  receivedAt: new Date('2026-11-12T09:00:00Z'),
  mail: { sourceId: id(7), message: 'message:18c2f0a' },
  source: { title: 'Partenariat', url: 'https://mail.google.test/7', kind: 'gmail' },
};
// Une préférence d'écriture que Leon a tirée de sa retouche.
const RETOUCHE: HomePreference = {
  id: id(801),
  from: 'Léa Roy',
  receivedAt: new Date('2026-11-13T09:00:00Z'),
  preference: 'Vous terminez vos mails par « Belle journée », jamais par <b>.',
  source: { title: 'Devis 2027', url: 'https://mail.google.test/8', kind: 'gmail' },
};
// Ses réponses envoyées : Leon écrit.
const REPONDUE: HomeDemande = {
  ...DEVIS,
  id: id(3),
  receivedAt: new Date('2026-11-11T09:00:00Z'),
  repondue: true,
};
const PRET: HomeBrouillon = {
  id: id(701),
  from: 'Léa Roy',
  receivedAt: new Date('2026-11-20T08:30:00Z'),
  texte: 'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] <b>.\n\nBien à vous',
  depose: false,
  source: { title: 'Devis 2027', url: 'https://mail.google.test/fil/1', kind: 'gmail' },
};
// Complet : déposé aussi dans ses brouillons Gmail.
const DEPOSE: HomeBrouillon = {
  id: id(703),
  from: 'marc@client.test',
  receivedAt: new Date('2026-11-18T08:30:00Z'),
  texte: 'Bonjour Marc,\n\nC’est entendu.',
  depose: true,
  source: { title: 'Contrat', url: 'https://mail.google.test/fil/3', kind: 'gmail' },
};

const within = (children: ReactNode, locale: 'en' | 'fr') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      children,
    }),
  );
const render = (
  demandes: Array<HomeDemande | HomeInconnu | HomePreference>,
  prets: HomeBrouillon[] = [],
  locale: 'en' | 'fr' = 'fr',
  name: string | null = 'Julie',
) => within(createElement(ReplyDrafts, { name, demandes, prets, max: 1000 }), locale);
// Un mail du panneau, tel qu'il s'y montre (sans le préchargement du logo de son outil, que React pose devant).
const mailView = (
  one: HomeDemande | HomeInconnu | HomePreference | HomeBrouillon,
  locale: 'en' | 'fr' = 'fr',
  over: { done?: Done; hidden?: boolean; failed?: boolean } = {},
) => {
  const [mail] = panelMails(
    'texte' in one ? [] : [one],
    'texte' in one ? [one] : [],
    over.done ?? {},
  );
  if (!mail) throw new Error('aucun mail');
  return within(
    createElement(MailView, {
      mail,
      place: 'place',
      hidden: over.hidden,
      failed: over.failed,
      max: 1000,
      onAnswers: () => {},
      onUnknown: () => {},
      onPreference: () => {},
      onDiscard: () => {},
      onRefresh: () => {},
    }),
    locale,
  ).replace(/^<link [^>]*>/, '');
};
// Les questions d'une demande, dans l'état `flow`.
const PANEL = 'panneau';
const questions = (flow: Flow, demande = DEVIS, locale: 'en' | 'fr' = 'fr') =>
  within(
    createElement(Questions, {
      id: PANEL,
      words: 'mots',
      demande,
      flow,
      dispatch: () => {},
      max: 1000,
      onSend: () => {},
      onDiscard: () => {},
    }),
    locale,
  );
// Le texte de l'écran, espaces fines et insécables ramenées à une espace.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .trim();
const count = (html: string, needle: string) => html.split(needle).length - 1;
// Les libellés des boutons, dans l'ordre.
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map((match) => match[1]);
// Les boutons radio, dans l'ordre : cochés ou non.
const radios = (html: string) =>
  [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0].includes('checked=""'));
// La ligne de l'Accueil : son nom accessible.
const label = (html: string) => /<button [^>]*aria-label="([^"]*)"/.exec(html)?.[1];

describe('ReplyDrafts : la ligne de l’Accueil', () => {
  it('rien ne l’attend : pas de ligne', () => {
    expect(render([])).toBe('');
  });

  it('une seule ligne, un seul bouton, qui ouvre le panneau : son prénom, « j’ai quelques questions », et le compte de ce qui attend', () => {
    const html = render([DEVIS, CONTRAT, INES, REPONDUE], [PRET]);

    expect(text(html)).toBe(
      'Julie, j’ai quelques questions à vous poser. 3 mails à compléter · 1 brouillon prêt · 1 réponse en cours',
    );
    expect(count(html, '<button')).toBe(1);
    // Son nom accessible dit le titre et le compte ; il dit qu'il ouvre une fenêtre, et la flèche du kit le montre.
    expect(label(html)).toBe(
      'Julie, j’ai quelques questions à vous poser. 3 mails à compléter · 1 brouillon prêt · 1 réponse en cours',
    );
    expect(html).toMatch(
      /<button type="button" class="tl card tl--wrap [^"]*"[^>]*aria-haspopup="dialog"/,
    );
    expect(html).toMatch(/<svg [^>]*class="[^"]*tl__chev" aria-hidden="true"/);
    // Le détail n'est plus sur l'Accueil : ni la carte, ni un correspondant, ni une question, ni un brouillon.
    expect(html).not.toMatch(/<ul|Leon a besoin de vous|Léa Roy|Inès|Acceptez-vous|Bonjour Léa/);
  });

  it('le mail d’un inconnu attend son geste aussi : une question, au singulier', () => {
    expect(text(render([INES]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 mail à compléter',
    );
  });

  it('sans rien à compléter, ses brouillons prêts : au singulier, au pluriel, sans les sortes absentes', () => {
    expect(text(render([], [PRET]))).toBe('Julie, votre brouillon est prêt. 1 brouillon prêt');
    expect(text(render([REPONDUE], [PRET, DEPOSE]))).toBe(
      'Julie, vos 2 brouillons sont prêts. 2 brouillons prêts · 1 réponse en cours',
    );
  });

  it('sans rien d’autre, ce que Leon écrit : au singulier, au pluriel', () => {
    expect(text(render([REPONDUE]))).toBe('Julie, j’écris votre réponse. 1 réponse en cours');
    expect(text(render([REPONDUE, { ...CONTRAT, repondue: true }]))).toBe(
      'Julie, j’écris vos 2 réponses. 2 réponses en cours',
    );
  });

  it('une préférence à valider attend son geste aussi : « j’ai quelques questions », et son compte, au singulier, au pluriel', () => {
    const autre = { ...RETOUCHE, id: id(802) };

    expect(text(render([RETOUCHE]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 préférence à valider',
    );
    expect(text(render([DEVIS, RETOUCHE, autre, REPONDUE], [PRET]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 mail à compléter · 2 préférences à valider · 1 brouillon prêt · 1 réponse en cours',
    );
    expect(text(render([RETOUCHE], [], 'en'))).toBe(
      'Julie, I have a few questions for you. 1 preference to confirm',
    );
    expect(text(render([RETOUCHE, autre], [PRET], 'en', null))).toBe(
      'I have a few questions for you. 2 preferences to confirm · 1 draft ready',
    );
  });

  it('sans prénom, les mêmes phrases sans le nommer', () => {
    const anon = (demandes: Array<HomeDemande | HomeInconnu>, prets: HomeBrouillon[] = []) =>
      text(render(demandes, prets, 'fr', null));

    expect(anon([DEVIS])).toBe('J’ai quelques questions à vous poser. 1 mail à compléter');
    expect(anon([], [PRET])).toBe('Votre brouillon est prêt. 1 brouillon prêt');
    expect(anon([], [PRET, DEPOSE])).toBe('Vos 2 brouillons sont prêts. 2 brouillons prêts');
    expect(anon([REPONDUE])).toBe('J’écris votre réponse. 1 réponse en cours');
  });

  it('en anglais, les mêmes phrases', () => {
    const english = (
      demandes: Array<HomeDemande | HomeInconnu>,
      prets: HomeBrouillon[] = [],
      name: string | null = 'Julie',
    ) => text(render(demandes, prets, 'en', name));

    expect(english([DEVIS, INES, REPONDUE], [PRET])).toBe(
      'Julie, I have a few questions for you. 2 emails to complete · 1 draft ready · 1 reply in progress',
    );
    expect(english([INES])).toBe('Julie, I have a few questions for you. 1 email to complete');
    expect(english([], [PRET])).toBe('Julie, your draft is ready. 1 draft ready');
    expect(english([REPONDUE], [PRET, DEPOSE])).toBe(
      'Julie, your 2 drafts are ready. 2 drafts ready · 1 reply in progress',
    );
    expect(english([REPONDUE])).toBe('Julie, I’m writing your reply. 1 reply in progress');
    expect(english([REPONDUE, { ...CONTRAT, repondue: true }])).toBe(
      'Julie, I’m writing your 2 replies. 2 replies in progress',
    );
    expect(english([DEVIS], [], null)).toBe('I have a few questions for you. 1 email to complete');
    expect(english([], [PRET, DEPOSE], null)).toBe('Your 2 drafts are ready. 2 drafts ready');
    expect(english([REPONDUE], [], null)).toBe('I’m writing your reply. 1 reply in progress');
  });
});

describe('ReplyDrafts : le panneau, tel qu’il s’ouvre', () => {
  const open = (
    demandes: Array<HomeDemande | HomeInconnu>,
    prets: HomeBrouillon[] = [],
    locale: 'en' | 'fr' = 'fr',
  ) => {
    view.open = true;
    try {
      const html = render(demandes, prets, locale);
      return html.slice(html.indexOf('<div data-panneau'));
    } finally {
      view.open = false;
    }
  };
  const ALL = [DEVIS, CONTRAT, INES, REPONDUE];
  // Les en-têtes des mails, dans l'ordre du panneau.
  const heads = (html: string) =>
    [...html.matchAll(/<div id="((?:demande|inconnu|brouillon)-[^"]+)" tabindex="-1"/g)].map(
      (match) => match[1],
    );

  it('le nom de l’agent, la place du mail montré, et les mails dans l’ordre : un geste d’elle, les brouillons prêts, ce que Leon écrit', () => {
    const html = open(ALL, [DEPOSE, PRET]);

    expect(html).toContain('<h2>Brouillons de réponse</h2>');
    expect(text(html)).toMatch(/^Brouillons de réponse Mail 1 sur 6 Inès Garnier/);
    expect(heads(html)).toEqual([
      `inconnu-${INES.mail.sourceId}`,
      `demande-${DEVIS.id}`,
      `demande-${CONTRAT.id}`,
      `brouillon-${PRET.id}`,
      `brouillon-${DEPOSE.id}`,
      `demande-${REPONDUE.id}`,
    ]);
  });

  it('un seul mail à la fois : les autres sont cachés ; son en-tête prend le focus à l’ouverture et rappelle sa place', () => {
    const html = open(ALL, [PRET]);
    const place = /<span id="([^"]+)" class="tabular-nums">Mail 1 sur 5<\/span>/.exec(html)?.[1];

    expect(place).toBeTruthy();
    expect(html).toContain(
      `<div id="inconnu-${INES.mail.sourceId}" tabindex="-1" data-autofocus="" aria-describedby="${place}"`,
    );
    expect(count(html, 'data-autofocus')).toBe(1);
    expect(count(html, '<div hidden="">')).toBe(4);
    expect(html.indexOf('<div hidden="">')).toBeGreaterThan(html.indexOf('Inès Garnier'));
  });

  it('au premier mail, « Mail suivant » seul ; un seul mail, « Terminé » ; plus rien, le panneau le dit, avec de quoi le fermer', () => {
    expect(buttons(open(ALL).split('<footer>')[1] ?? '')).toEqual(['Mail suivant']);
    const one = open([], [PRET]);
    expect(text(one)).toContain('Mail 1 sur 1');
    expect(buttons(one.split('<footer>')[1] ?? '')).toEqual(['Terminé']);

    const none = open([]);
    expect(text(none)).toBe('Brouillons de réponse C’est tout pour l’instant. Terminé');
    expect(none).toContain('role="status"');
  });

  it('en anglais, les mêmes mots', () => {
    const html = open(ALL, [PRET], 'en');

    expect(text(html)).toMatch(/^Reply drafts Email 1 of 5 Inès Garnier/);
    expect(buttons(html.split('<footer>')[1] ?? '')).toEqual(['Next email']);
    expect(text(open([], [], 'en'))).toBe('Reply drafts That’s all for now. Done');
  });

  it('« Mail précédent », « Mail suivant », la confirmation d’« Écarter » : les mêmes mots dans les deux langues', () => {
    const words = (messages: typeof fr) => {
      const d = messages.draftQuestions;
      return [
        d.previousMail,
        d.nextMail,
        d.confirmDiscard,
        d.confirmDiscardText,
        d.discard,
        d.keep,
      ];
    };

    expect(words(fr)).toEqual([
      'Mail précédent',
      'Mail suivant',
      'Écarter ce brouillon ?',
      'Il sera aussi supprimé de vos brouillons Gmail.',
      'Écarter',
      'Garder',
    ]);
    expect(words(en)).toEqual([
      'Previous email',
      'Next email',
      'Dismiss this draft?',
      'It will also be deleted from your Gmail drafts.',
      'Dismiss',
      'Keep',
    ]);
  });
});

describe('MailView : un mail du panneau', () => {
  it('son en-tête : le correspondant, la date du mail reçu, le fil lié à son outil ; il prend le focus et rappelle sa place', () => {
    const html = mailView(DEVIS);

    expect(html).toMatch(
      new RegExp(
        `^<div><div id="demande-${DEVIS.id}" tabindex="-1" data-autofocus="" aria-describedby="place"[^>]*><h3[^>]*>Léa Roy</h3>`,
      ),
    );
    expect(text(html)).toContain('Léa Roy Reçu le 10 nov. 2026');
    expect(html).toContain('dateTime="2026-11-10T09:00:00.000Z"');
    expect(html).toContain('href="https://mail.google.test/2"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(text(html)).toContain('Devis 2027 Gmail');
  });

  it('caché, il ne prend pas le focus à l’ouverture ; en échec, il le dit', () => {
    const hidden = mailView(DEVIS, 'fr', { hidden: true });
    expect(hidden).toMatch(/^<div hidden="">/);
    expect(hidden).not.toContain('data-autofocus');

    const failed = mailView(DEVIS, 'fr', { failed: true });
    expect(failed).toMatch(/<div role="alert"[^>]*>.*Une erreur est survenue\. Réessayez\./);
  });

  it('des questions : la première tout de suite, sa place, ses choix, « Autre », puis « Suivant » et « Écarter »', () => {
    const html = mailView(DEVIS);

    expect(text(html)).not.toMatch(/Voulez-vous voir mes questions/);
    expect(html).toMatch(
      new RegExp(
        `<fieldset id="demande-${DEVIS.id}-questions-etape" tabindex="-1"[^>]*><legend[^>]*><span[^>]*>Question 1 sur 2</span><span[^>]*>Acceptez-vous le rendez-vous de mardi \\?</span></legend>`,
      ),
    );
    expect(text(html)).toContain('Oui Non, proposer jeudi Autre');
    expect(radios(html)).toEqual([false, false, false]);
    expect(buttons(html)).toEqual(['Suivant', 'Écarter']);
    // « Écarter » rappelle l'en-tête du mail. Pas de formulaire : « Entrée » sur un choix n'envoie rien.
    expect(html).toMatch(
      new RegExp(`<button [^>]*aria-describedby="demande-${DEVIS.id}"[^>]*>Écarter`),
    );
    expect(html).not.toContain('<form');
  });

  it('le mail d’un inconnu : « Voulez-vous une réponse ? », « Oui » et « Non », puis ses indications, fermées d’abord ; rien du mail', () => {
    const html = mailView(INES);
    const words = `inconnu-${INES.mail.sourceId}`;
    const panel = `${words}-indications`;

    expect(text(html)).toContain('Inès Garnier Reçu le 12 nov. 2026');
    expect(text(html)).toContain('Voulez-vous une réponse ? Oui Non');
    expect(count(html, `aria-describedby="${words}-voir ${words}"`)).toBe(2);
    expect(html).toContain(`<div id="${panel}" hidden=""`);
    expect(html).toMatch(new RegExp(`<label for="${panel}-champ"[^>]*>Vos indications</label>`));
    expect(html).toMatch(
      new RegExp(
        `<textarea rows="2"[^>]*id="${panel}-champ"[^>]*aria-describedby="${panel}-champ-note"[^>]*maxLength="1000"`,
      ),
    );
    expect(text(html)).toContain(
      'Ce que vous voulez répondre, en quelques mots. Vous pouvez laisser vide.',
    );
    expect(buttons(html)).toEqual(['Oui', 'Non', 'Préparer la réponse', 'Écarter']);
    expect(html).not.toMatch(/message:|inconnue\.test|<form/);
  });

  it('un brouillon prêt : son texte, déplié, tel quel, « Copier » et « Écarter »', () => {
    const html = mailView(PRET);

    expect(text(html)).toContain('Brouillon prêt Bonjour Léa');
    expect(html).toMatch(/<p class="[^"]*whitespace-pre-wrap[^"]*">Bonjour Léa,/);
    expect(html).toContain(
      'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] &lt;b&gt;.\n\nBien à vous',
    );
    expect(buttons(html)).toEqual(['Copier', 'Écarter']);
    expect(count(html, `aria-describedby="brouillon-${PRET.id}"`)).toBe(2);
    // « Garder », dans la confirmation, rend le focus à « Écarter ».
    expect(html).toContain(`id="brouillon-${PRET.id}-ecarter"`);
    expect(text(html)).not.toMatch(/Déposé|Gmail\./);
  });

  it('un brouillon déposé dans Gmail le dit ; la confirmation d’« Écarter » dira qu’il en sera supprimé', () => {
    expect(text(mailView(DEPOSE))).toContain(
      'Bonjour Marc, C’est entendu. Déposé dans vos brouillons Gmail. Copier Écarter',
    );
    expect(text(mailView(DEPOSE))).not.toContain('l’en retire');
    expect(text(mailView(DEPOSE, 'en'))).toContain('Saved to your Gmail drafts. Copy Dismiss');
    expect(text(mailView(DEPOSE))).toContain('marc@client.test');
  });

  it('une réponse que Leon écrit : la phrase qui le dit, « Actualiser » et « Écarter » ; plus de question', () => {
    const html = mailView(REPONDUE);
    const words = `demande-${REPONDUE.id}`;

    expect(html).toContain('<span class="mark is-working">J’écris votre réponse.</span>');
    // Au dernier mail, l'envoi ne laisse que le focus sur l'en-tête : il dit aussi que Leon écrit.
    expect(html).toContain(
      `<div id="${words}" tabindex="-1" data-autofocus="" aria-describedby="place ${words}-ecrit"`,
    );
    expect(html).toContain(`<p id="${words}-ecrit"`);
    expect(buttons(html)).toEqual(['Actualiser', 'Écarter']);
    expect(html).not.toMatch(/<fieldset|<input|<textarea/);
    expect(text(html)).not.toMatch(/Acceptez-vous|Envoyer mes réponses/);
  });

  it('son oui à un inconnu : Leon écrit, et « Écarter » vise la ligne de son oui', () => {
    const html = mailView(INES, 'fr', { done: { [`inconnu-${INES.mail.sourceId}`]: id(99) } });

    expect(text(html)).toContain('Inès Garnier Reçu le 12 nov. 2026');
    expect(text(html)).toContain('J’écris votre réponse. Actualiser Écarter');
    expect(text(html)).not.toContain('Voulez-vous une réponse');
  });

  it('une préférence d’écriture : la retouche remarquée, la date, le fil, la préférence telle quelle, puis « Dois-je en tenir compte… ? », « Oui » et « Non »', () => {
    const html = mailView(RETOUCHE);
    const words = `preference-${RETOUCHE.id}`;

    expect(html).toMatch(
      new RegExp(
        `^<div><div id="${words}" tabindex="-1" data-autofocus="" aria-describedby="place"[^>]*><h3[^>]*>J’ai remarqué une retouche sur ma réponse à Léa Roy\\.</h3>`,
      ),
    );
    expect(text(html)).toBe(
      'J’ai remarqué une retouche sur ma réponse à Léa Roy. Reçu le 13 nov. 2026 Devis 2027 Gmail Vous terminez vos mails par « Belle journée », jamais par &lt;b&gt;. Dois-je en tenir compte pour vos prochains brouillons ? Oui Non',
    );
    expect(html).toContain('href="https://mail.google.test/8"');
    // Le texte tel quel, échappé.
    expect(html).toContain(`<p id="${words}-preference" class="whitespace-pre-wrap`);
    expect(html).toContain('jamais par &lt;b&gt;.</p>');
    expect(buttons(html)).toEqual(['Oui', 'Non']);
    // « Oui » et « Non » rappellent la question et la préférence ; ni « Écarter », ni texte à écrire.
    expect(count(html, `aria-describedby="${words}-tenir ${words}-preference"`)).toBe(2);
    expect(html).not.toMatch(/<textarea|<input|Écarter/);
  });

  it('une préférence sans nom de correspondant, et en anglais', () => {
    expect(text(mailView({ ...RETOUCHE, from: null }))).toMatch(
      /^J’ai remarqué une retouche sur l’une de mes réponses\. Reçu le 13 nov\. 2026/,
    );
    const english = text(mailView(RETOUCHE, 'en'));
    expect(english).toMatch(/^I noticed you edited my reply to Léa Roy\. Received on Nov 13, 2026/);
    expect(english).toContain('Should I keep this in mind for your next drafts? Yes No');
    expect(text(mailView({ ...RETOUCHE, from: null }, 'en'))).toMatch(
      /^I noticed you edited one of my replies\./,
    );
  });

  it('sans nom de correspondant ni titre de fil, des mots à la place ; un fil sans lien se montre sans s’ouvrir', () => {
    const html = mailView(CONTRAT);

    expect(text(html)).toContain('Votre correspondant Reçu le 9 nov. 2026');
    expect(text(html)).toContain('Sans titre Outlook');
    expect(html).not.toContain('href=');
  });

  it('en anglais, les mêmes mots', () => {
    const said = [DEVIS, CONTRAT, INES, PRET, REPONDUE]
      .map((one) => text(mailView(one, 'en')))
      .join(' ');

    for (const one of [
      'Received on Nov 10, 2026',
      'Your correspondent',
      'Untitled',
      'Question 1 of 2',
      'Next',
      'Do you want a reply? Yes No',
      'Your instructions',
      'What you want to reply, in a few words. You can leave it empty.',
      'Prepare the reply',
      'Draft ready',
      'Copy',
      'Dismiss',
      'I’m writing your reply.',
      'Refresh',
      // Les questions et leurs choix restent dans la langue du mail reçu.
      'Acceptez-vous le rendez-vous de mardi ?',
      'Can you sign before Friday?',
    ])
      expect(said, one).toContain(one);
    expect(said).not.toMatch(/draftQuestions\.|fiche\./);
  });
});

describe('Questions : une question à la fois, puis le récapitulatif', () => {
  const START = startFlow(DEVIS.choix);

  it('un choix retenu est le seul coché', () => {
    const html = questions({ ...START, picks: [{ choice: 1, text: '' }, START.picks[1] as never] });

    expect(radios(html)).toEqual([false, true, false]);
    expect(html).not.toContain('<textarea');
  });

  it('« Autre » retenu ouvre un texte libre, nommé et borné, avec ce qu’elle a déjà écrit', () => {
    const html = questions({
      ...START,
      picks: [{ choice: OTHER, text: 'Plutôt mercredi.' }, START.picks[1] as never],
    });

    expect(radios(html)).toEqual([false, false, true]);
    expect(html).toMatch(
      /<textarea [^>]*aria-label="Votre réponse"[^>]*maxLength="1000"[^>]*>Plutôt mercredi\.<\/textarea>/,
    );
    // Dans le groupe de la question, après « Autre ».
    expect(html).toMatch(/Autre<\/label><textarea [^>]*>[^<]*<\/textarea><\/fieldset>/);
  });

  it('la question suivante : sa place, ses choix, « Précédent » et « Suivant »', () => {
    const html = questions({ ...START, step: 1 });

    expect(text(html)).toContain('Question 2 sur 2 Quel prix lui annoncer ?');
    expect(text(html)).toContain('1 200 € 1 500 € Le tarif habituel Autre');
    expect(text(html)).not.toContain('Acceptez-vous');
    expect(radios(html)).toEqual([false, false, false, false]);
    expect(buttons(html)).toEqual(['Précédent', 'Suivant', 'Écarter']);
  });

  it('après la dernière, le récapitulatif : chaque question avec sa réponse, à modifier, puis « Envoyer mes réponses »', () => {
    const html = questions({
      step: 2,
      picks: [
        { choice: 1, text: '' },
        { choice: OTHER, text: 'Mille euros,\nhors taxes.' },
      ],
    });

    // Le titre prend le focus, comme une question.
    expect(html).toContain(`<p id="${PANEL}-etape" tabindex="-1"`);
    expect(text(html)).toContain(
      'Vos réponses Acceptez-vous le rendez-vous de mardi ? Non, proposer jeudi Modifier Quel prix lui annoncer ? Mille euros, hors taxes. Modifier',
    );
    expect(html).toContain('Mille euros,\nhors taxes.');
    // Plus de question à l'écran, et « Modifier » rappelle la sienne.
    expect(html).not.toMatch(/<fieldset|<input|<textarea/);
    for (const index of [0, 1])
      expect(html).toMatch(
        new RegExp(`<button [^>]*aria-describedby="${PANEL}-question-${index}"[^>]*>Modifier`),
      );
    expect(buttons(html)).toEqual([
      'Modifier',
      'Modifier',
      'Précédent',
      'Envoyer mes réponses',
      'Écarter',
    ]);
  });

  it('une question passée, ou « Autre » laissé vide, se lit « Sans réponse » au récapitulatif', () => {
    const html = questions({
      step: 2,
      picks: [
        { choice: null, text: '' },
        { choice: OTHER, text: '  ' },
      ],
    });

    expect(count(text(html), 'Sans réponse')).toBe(2);
  });

  it('une demande posée avant les choix : la question et son texte libre, sans bouton radio', () => {
    const old = { ...DEVIS, choix: [[], []] };
    const html = questions(startFlow(old.choix), old);

    expect(text(html)).toContain('Question 1 sur 2 Acceptez-vous le rendez-vous de mardi ?');
    expect(html).not.toContain('type="radio"');
    expect(text(html)).not.toContain('Autre');
    expect(html).toMatch(/<textarea [^>]*aria-label="Votre réponse"[^>]*maxLength="1000"/);
  });

  it('en anglais, les mêmes mots', () => {
    const recap = text(questions({ step: 1, picks: [{ choice: null, text: '' }] }, CONTRAT, 'en'));

    for (const one of ['Your answers', 'No answer', 'Change', 'Previous', 'Send my answers'])
      expect(recap, one).toContain(one);
    expect(questions({ step: 0, picks: [{ choice: OTHER, text: '' }] }, CONTRAT, 'en')).toContain(
      'aria-label="Your answer"',
    );
  });
});
