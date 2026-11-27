import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SidePanelProps } from '@/components/verre';
import { type Flow, OTHER, startFlow } from '@/lib/draft-questions';
import { type Done, panelMails, quietMails } from '@/lib/reply-drafts';
import type {
  HomeBrouillon,
  HomeDemande,
  HomePreference,
  HomeRelance,
  HomeSansReponse,
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
  answerRelanceAction: vi.fn(),
  discardBrouillonAction: vi.fn(),
  prepareReplyAction: vi.fn(),
  sendBrouillonAction: vi.fn(),
  trashMailAction: vi.fn(),
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
  relance: false,
  source: { title: 'Devis 2027', url: 'https://mail.google.test/2', kind: 'gmail' },
};
const CONTRAT: HomeDemande = {
  id: id(2),
  from: null,
  receivedAt: new Date('2026-11-09T09:00:00Z'),
  questions: ['Can you sign before Friday?'],
  choix: [['Yes', 'No']],
  repondue: false,
  relance: false,
  source: { title: null, url: null, kind: 'outlook' },
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
  others: 0,
  relance: false,
  source: { title: 'Devis 2027', url: 'https://mail.google.test/fil/1', kind: 'gmail' },
};
// Complet : déposé aussi dans ses brouillons Gmail.
const DEPOSE: HomeBrouillon = {
  id: id(703),
  from: 'marc@client.test',
  receivedAt: new Date('2026-11-18T08:30:00Z'),
  texte: 'Bonjour Marc,\n\nC’est entendu.',
  depose: true,
  others: 0,
  relance: false,
  source: { title: 'Contrat', url: 'https://mail.google.test/fil/3', kind: 'gmail' },
};
// Son mail à Léa resté sans réponse, envoyé le 14 : la question de relance. À plusieurs, avec deux autres.
const SANS_REPONSE: HomeRelance = {
  relance: true,
  from: 'Léa Roy',
  others: 0,
  receivedAt: new Date('2026-11-14T09:00:00Z'),
  mail: { sourceId: id(9), message: 'message:5d1e' },
  source: { title: 'Devis 2027', url: 'https://mail.google.test/9', kind: 'gmail' },
};
const A_PLUSIEURS: HomeRelance = {
  ...SANS_REPONSE,
  others: 2,
  mail: { ...SANS_REPONSE.mail, sourceId: id(10) },
};
// La relance prête, écrite après son oui.
const RELANCE_PRETE: HomeBrouillon = {
  ...PRET,
  id: id(704),
  receivedAt: SANS_REPONSE.receivedAt,
  texte: 'Bonjour Léa,\n\nAvez-vous pu regarder le devis ?\n\nBien à vous',
  relance: true,
};

// Un mail en hébreu mêlé de français, comme l'accueil le reçoit : le début de son texte, ses questions dans sa langue.
const HEBREU: HomeDemande = {
  id: id(4),
  from: 'יעל כהן',
  receivedAt: new Date('2026-11-12T09:00:00Z'),
  questions: ['האם המחיר כולל את החשמל?'],
  choix: [['כן', 'לא']],
  repondue: false,
  relance: false,
  source: {
    title: 'הצעת מחיר – devis bureau',
    url: 'https://mail.google.test/4',
    kind: 'gmail',
    mailText: 'שלום דוד,\n\nקיבלת את ההצעה?\n\nMerci de confirmer.',
    extrait: 'שלום דוד, קיבלת את ההצעה? Merci de confirmer.',
  },
};
const HEBREU_PRET: HomeBrouillon = {
  ...PRET,
  id: id(705),
  from: HEBREU.from,
  texte: 'שלום יעל,\n\nכן, המחיר כולל הכול.\n\nBien à vous',
  source: HEBREU.source,
};

// Des mails que Leon a jugés sans réponse à donner : un remerciement, un mail en hébreu, un fil Outlook sans texte lu.
const MERCI: HomeSansReponse = {
  id: id(901),
  from: 'Sophie Garnier',
  receivedAt: new Date('2026-11-21T09:00:00Z'),
  relance: false,
  source: {
    title: 'Merci pour la visite',
    url: 'https://mail.google.test/21',
    kind: 'gmail',
    mailText: 'Bonjour Julie,\n\nMerci pour la visite.',
    extrait: 'Bonjour Julie, Merci pour la visite.',
  },
};
const TODA: HomeSansReponse = {
  ...MERCI,
  id: id(902),
  from: 'אבי מזרחי',
  receivedAt: new Date('2026-11-20T09:00:00Z'),
  source: { ...HEBREU.source, title: 'תודה על הפגישה' },
};
const INFO: HomeSansReponse = {
  ...MERCI,
  id: id(903),
  from: null,
  receivedAt: new Date('2026-11-19T09:00:00Z'),
  source: { title: null, url: null, kind: 'outlook' },
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
  demandes: Array<HomeDemande | HomePreference | HomeRelance>,
  prets: HomeBrouillon[] = [],
  locale: 'en' | 'fr' = 'fr',
  name: string | null = 'Julie',
  sansReponse: HomeSansReponse[] = [],
) => within(createElement(ReplyDrafts, { name, demandes, prets, sansReponse, max: 1000 }), locale);
// Un mail jugé sans réponse à donner, tel que son panneau le montre.
const quietView = (one: HomeSansReponse, locale: 'en' | 'fr' = 'fr', trash = true) => {
  const [mail] = quietMails([one], {});
  if (!mail) throw new Error('aucun mail');
  return within(
    createElement(MailView, {
      mail,
      place: 'place',
      max: 1000,
      onAnswers: () => {},
      onRelance: () => {},
      onPreference: () => {},
      onDiscard: () => {},
      onRefresh: () => {},
      onPrepare: () => {},
      onTrash: trash ? () => {} : undefined,
    }),
    locale,
  ).replace(/^<link [^>]*>/, '');
};
// Un mail du panneau, tel qu'il s'y montre (sans le préchargement du logo de son outil, que React pose devant).
const mailView = (
  one: HomeDemande | HomePreference | HomeRelance | HomeBrouillon,
  locale: 'en' | 'fr' = 'fr',
  over: { done?: Done; hidden?: boolean; failed?: boolean; send?: boolean; trash?: boolean } = {},
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
      onRelance: () => {},
      onPreference: () => {},
      onDiscard: () => {},
      onRefresh: () => {},
      onSendDraft: over.send ? () => {} : undefined,
      onTrash: over.trash ? () => {} : undefined,
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
// L'en-tête de « À vous », la pile de l'Accueil : la phrase de Leon, puis le compte de ce qui attend.
const line = (html: string) => {
  const pile = html.slice(html.indexOf('<section'));
  const summary = /<\/h2><span[^>]*>(.*?)<\/span>/.exec(pile)?.[1] ?? '';
  const title = /<p class="basis-full[^"]*">(.*?)<\/p>/.exec(pile)?.[1] ?? '';
  return text(`${title} ${summary}`);
};
// Les libellés des boutons, dans l'ordre.
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map((match) => match[1]);
// Les boutons radio, dans l'ordre : cochés ou non.
const radios = (html: string) =>
  [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0].includes('checked=""'));

describe('ReplyDrafts : la pile « À vous » de l’Accueil', () => {
  it('rien ne l’attend : « À vous » le dit, sans bouton', () => {
    const html = render([]);

    expect(text(html)).toBe(
      'À vous Rien ne vous attend pour l’instant. Quand un mail demandera une réponse, Leon vous posera ici ses questions, puis vous montrera son brouillon.',
    );
    expect(count(html, '<button')).toBe(0);
  });

  it('la phrase de Leon et le compte, le mail montré ouvert dans la page, les suivants dessous, « Tout traiter »', () => {
    const html = render([DEVIS, CONTRAT, SANS_REPONSE, REPONDUE], [PRET]);

    expect(line(html)).toBe(
      'Julie, j’ai quelques questions à vous poser. 2 mails à compléter · 1 relance à décider · 1 brouillon prêt · 1 brouillon en cours',
    );
    // Le mail montré, ouvert : son en-tête, sans prendre le focus au chargement.
    expect(count(html, '<article')).toBe(1);
    // Les quatre autres, puis « Tout traiter » : chacun ouvre le panneau.
    expect(count(html, 'aria-haspopup="dialog"')).toBe(5);
    expect(html).toContain('>Tout traiter</button>');
  });

  it('sans rien à compléter, ses brouillons prêts : au singulier, au pluriel, sans les sortes absentes', () => {
    expect(line(render([], [PRET]))).toBe('Julie, votre brouillon est prêt. 1 brouillon prêt');
    expect(line(render([REPONDUE], [PRET, DEPOSE]))).toBe(
      'Julie, vos 2 brouillons sont prêts. 2 brouillons prêts · 1 brouillon en cours',
    );
  });

  it('sans rien d’autre, ce que Leon écrit : au singulier, au pluriel', () => {
    expect(line(render([REPONDUE]))).toBe('Julie, j’écris votre brouillon. 1 brouillon en cours');
    expect(line(render([REPONDUE, { ...CONTRAT, repondue: true }]))).toBe(
      'Julie, j’écris vos 2 brouillons. 2 brouillons en cours',
    );
  });

  it('une préférence à valider attend son geste aussi : « j’ai quelques questions », et son compte, au singulier, au pluriel', () => {
    const autre = { ...RETOUCHE, id: id(802) };

    expect(line(render([RETOUCHE]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 préférence à valider',
    );
    expect(line(render([DEVIS, RETOUCHE, autre, REPONDUE], [PRET]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 mail à compléter · 2 préférences à valider · 1 brouillon prêt · 1 brouillon en cours',
    );
    expect(line(render([RETOUCHE], [], 'en'))).toBe(
      'Julie, I have a few questions for you. 1 preference to confirm',
    );
    expect(line(render([RETOUCHE, autre], [PRET], 'en', null))).toBe(
      'I have a few questions for you. 2 preferences to confirm · 1 draft ready',
    );
  });

  it('une relance à décider attend son geste aussi : « j’ai quelques questions », et son compte à part, au singulier, au pluriel', () => {
    expect(line(render([SANS_REPONSE]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 relance à décider',
    );
    expect(line(render([DEVIS, SANS_REPONSE, A_PLUSIEURS], [RELANCE_PRETE]))).toBe(
      'Julie, j’ai quelques questions à vous poser. 1 mail à compléter · 2 relances à décider · 1 brouillon prêt',
    );
    expect(line(render([SANS_REPONSE], [], 'en'))).toBe(
      'Julie, I have a few questions for you. 1 follow-up to decide',
    );
    expect(line(render([SANS_REPONSE, A_PLUSIEURS], [], 'en', null))).toBe(
      'I have a few questions for you. 2 follow-ups to decide',
    );
  });

  it('sans prénom, les mêmes phrases sans le nommer', () => {
    const anon = (demandes: HomeDemande[], prets: HomeBrouillon[] = []) =>
      line(render(demandes, prets, 'fr', null));

    expect(anon([DEVIS])).toBe('J’ai quelques questions à vous poser. 1 mail à compléter');
    expect(anon([], [PRET])).toBe('Votre brouillon est prêt. 1 brouillon prêt');
    expect(anon([], [PRET, DEPOSE])).toBe('Vos 2 brouillons sont prêts. 2 brouillons prêts');
    expect(anon([REPONDUE])).toBe('J’écris votre brouillon. 1 brouillon en cours');
  });

  it('en anglais, les mêmes phrases', () => {
    const english = (
      demandes: HomeDemande[],
      prets: HomeBrouillon[] = [],
      name: string | null = 'Julie',
    ) => line(render(demandes, prets, 'en', name));

    expect(english([DEVIS, CONTRAT, REPONDUE], [PRET])).toBe(
      'Julie, I have a few questions for you. 2 emails to complete · 1 draft ready · 1 draft in progress',
    );
    expect(english([DEVIS])).toBe('Julie, I have a few questions for you. 1 email to complete');
    expect(english([], [PRET])).toBe('Julie, your draft is ready. 1 draft ready');
    expect(english([REPONDUE], [PRET, DEPOSE])).toBe(
      'Julie, your 2 drafts are ready. 2 drafts ready · 1 draft in progress',
    );
    expect(english([REPONDUE])).toBe('Julie, I’m writing your draft. 1 draft in progress');
    expect(english([REPONDUE, { ...CONTRAT, repondue: true }])).toBe(
      'Julie, I’m writing your 2 drafts. 2 drafts in progress',
    );
    expect(english([DEVIS], [], null)).toBe('I have a few questions for you. 1 email to complete');
    expect(english([], [PRET, DEPOSE], null)).toBe('Your 2 drafts are ready. 2 drafts ready');
    expect(english([REPONDUE], [], null)).toBe('I’m writing your draft. 1 draft in progress');
  });
});

describe('ReplyDrafts : le panneau, tel qu’il s’ouvre', () => {
  const open = (
    demandes: Array<HomeDemande | HomeRelance>,
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
  const ALL = [DEVIS, CONTRAT, REPONDUE];
  // Les en-têtes des mails, dans l'ordre du panneau.
  const heads = (html: string) =>
    [...html.matchAll(/<div id="((?:demande|brouillon)-[^"]+)" tabindex="-1"/g)].map(
      (match) => match[1],
    );

  it('le nom de l’agent, la place du mail montré, et les mails dans l’ordre : un geste d’elle, les brouillons prêts, ce que Leon écrit', () => {
    const html = open(ALL, [DEPOSE, PRET]);

    expect(html).toContain('<h2>Brouillons de réponse</h2>');
    expect(text(html)).toMatch(/^Brouillons de réponse Mail 1 sur 5 Léa Roy/);
    expect(heads(html)).toEqual([
      `demande-${DEVIS.id}`,
      `demande-${CONTRAT.id}`,
      `brouillon-${PRET.id}`,
      `brouillon-${DEPOSE.id}`,
      `demande-${REPONDUE.id}`,
    ]);
  });

  it('un seul mail à la fois : les autres sont cachés ; son en-tête prend le focus à l’ouverture et rappelle sa place', () => {
    const html = open(ALL, [PRET]);
    const place = /<span id="([^"]+)" class="tabular-nums">Mail 1 sur 4<\/span>/.exec(html)?.[1];

    expect(place).toBeTruthy();
    expect(html).toContain(
      `<div id="demande-${DEVIS.id}" tabindex="-1" data-autofocus="" aria-describedby="${place}"`,
    );
    expect(count(html, 'data-autofocus')).toBe(1);
    expect(count(html, '<div hidden="">')).toBe(3);
    expect(html.indexOf('<div hidden="">')).toBeGreaterThan(html.indexOf('Léa Roy'));
  });

  it('son titre suit ce qu’il montre : « Relances » pour des relances seules, « Brouillons et relances » pour les deux', () => {
    expect(open([SANS_REPONSE], [RELANCE_PRETE])).toContain('<h2>Relances</h2>');
    expect(open([SANS_REPONSE, DEVIS])).toContain('<h2>Brouillons et relances</h2>');
    expect(open([A_PLUSIEURS], [PRET], 'en')).toContain('<h2>Drafts and follow-ups</h2>');
    expect(open([DEVIS], [PRET])).toContain('<h2>Brouillons de réponse</h2>');
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

    expect(text(html)).toMatch(/^Reply drafts Email 1 of 4 Léa Roy/);
    expect(buttons(html.split('<footer>')[1] ?? '')).toEqual(['Next email']);
    expect(text(open([], [], 'en'))).toBe('Reply drafts That’s all for now. Done');
  });

  it('« Mail précédent », « Mail suivant », les confirmations d’« Écarter » et de « Supprimer le mail » : les mêmes mots dans les deux langues', () => {
    const words = (messages: typeof fr) => {
      const d = messages.draftQuestions;
      return [
        d.previousMail,
        d.nextMail,
        d.confirmDiscard,
        d.confirmDiscardText,
        d.discard,
        d.keep,
        d.trash.confirm,
        d.trash.confirmText,
        d.trash.yes,
        d.trash.done,
      ];
    };

    expect(words(fr)).toEqual([
      'Mail précédent',
      'Mail suivant',
      'Écarter ce brouillon ?',
      'Il sera aussi supprimé de vos brouillons Gmail.',
      'Écarter',
      'Garder',
      'Supprimer ce mail ?',
      'Il part à la corbeille de votre boîte Gmail, où il reste trente jours.',
      'Supprimer',
      'Mail mis à la corbeille de Gmail.',
    ]);
    expect(words(en)).toEqual([
      'Previous email',
      'Next email',
      'Dismiss this draft?',
      'It will also be deleted from your Gmail drafts.',
      'Dismiss',
      'Keep',
      'Delete this email?',
      'It goes to the trash of your Gmail mailbox, where it stays for thirty days.',
      'Delete',
      'Email moved to Gmail trash.',
    ]);
  });
});

describe('MailView : un mail du panneau', () => {
  it('son en-tête : le correspondant, la date du mail reçu, le fil lié à son outil ; il prend le focus et rappelle sa place', () => {
    const html = mailView(DEVIS);

    expect(html).toMatch(
      new RegExp(
        `^<div><div id="demande-${DEVIS.id}" tabindex="-1" data-autofocus="" aria-describedby="place"[^>]*><h3[^>]*><bdi>Léa Roy</bdi></h3>`,
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

  it('un brouillon prêt : son texte, déplié, tel quel, « Copier » et « Écarter »', () => {
    const html = mailView(PRET);

    expect(text(html)).toContain('Brouillon prêt Bonjour Léa');
    expect(html).toMatch(/<p dir="auto" class="[^"]*whitespace-pre-wrap[^"]*">Bonjour Léa,/);
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

  it('un mail reçu relevé par Gmail se supprime d’ici : « Supprimer le mail », à chaque étape ; jamais un fil Outlook, son propre mail ni une préférence', () => {
    for (const one of [DEVIS, REPONDUE, PRET]) {
      const html = mailView(one, 'fr', { trash: true });
      expect(buttons(html), one.id).toContain('Supprimer le mail');
      // « Garder », dans la confirmation, rend le focus à « Supprimer le mail ».
      expect(html).toMatch(new RegExp(`id="(?:demande|brouillon)-${one.id}-supprimer"`));
    }
    expect(buttons(mailView(DEVIS, 'en', { trash: true }))).toContain('Delete email');
    for (const one of [CONTRAT, SANS_REPONSE, RELANCE_PRETE, RETOUCHE])
      expect(text(mailView(one, 'fr', { trash: true }))).not.toContain('Supprimer le mail');
    // Sans le geste (un écran qui ne le porte pas), pas de bouton.
    expect(text(mailView(DEVIS))).not.toContain('Supprimer le mail');
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
      'J’ai remarqué une retouche sur ma réponse à Léa Roy. Reçu le 13 nov. 2026 · Gmail Devis 2027 Gmail Vous terminez vos mails par « Belle journée », jamais par &lt;b&gt;. Dois-je en tenir compte pour vos prochains brouillons ? Oui Non',
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
    const said = [DEVIS, CONTRAT, PRET, REPONDUE].map((one) => text(mailView(one, 'en'))).join(' ');

    for (const one of [
      'Received on Nov 10, 2026',
      'Your correspondent',
      'Untitled',
      'Question 1 of 2',
      'Next',
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

describe('MailView : ce qui vient d’un mail se lit dans son sens, l’hébreu de droite à gauche', () => {
  it('le début du mail suit son objet, avant les questions de Leon, et prend son sens d’après ses lettres', () => {
    const html = mailView(HEBREU);

    expect(html).toMatch(
      /<p dir="auto" class="[^"]*line-clamp-3[^"]*">שלום דוד, קיבלת את ההצעה\? Merci de confirmer\.<\/p>/,
    );
    const at = (needle: string) => html.indexOf(needle);
    expect(at('הצעת מחיר')).toBeGreaterThan(-1);
    expect(at('שלום דוד, קיבלת')).toBeGreaterThan(at('הצעת מחיר'));
    expect(at('האם המחיר')).toBeGreaterThan(at('שלום דוד, קיבלת'));
    // Le texte entier reste derrière « Voir le mail ».
    expect(buttons(html)).toContain('Voir le mail');
    expect(html).not.toContain('Merci de confirmer.\n');
  });

  it('un mail dont le texte n’a pas pu se lire se montre sans extrait', () => {
    expect(mailView(DEVIS)).not.toContain('line-clamp');
    expect(
      mailView({ ...HEBREU, source: { ...HEBREU.source, mailText: null, extrait: null } }),
    ).not.toContain('line-clamp');
  });

  it('le nom de l’expéditeur est isolé de ce qui l’entoure, et l’objet du fil prend son sens d’après ses lettres', () => {
    const html = mailView(HEBREU);

    expect(html).toMatch(/<h3[^>]*><bdi>יעל כהן<\/bdi><\/h3>/);
    expect(html).toMatch(
      /<span class="tl__name" dir="auto"[^>]*><span class="mark">הצעת מחיר – devis bureau<\/span>/,
    );
  });

  it('la question, ses choix et le texte libre prennent leur sens d’après leurs lettres', () => {
    const html = mailView(HEBREU);

    expect(html).toMatch(
      /<span dir="auto" class="[^"]*text-head[^"]*">האם המחיר כולל את החשמל\?<\/span>/,
    );
    // Un choix en hébreu : toute sa tuile se lit de droite à gauche, son bouton radio à droite.
    expect(html).toMatch(/<label dir="auto" class="[^"]*"><input type="radio"[^>]*\/>כן<\/label>/);
    expect(html).toMatch(/<label dir="auto" class="[^"]*"><input type="radio"[^>]*\/>לא<\/label>/);
    const other = questions({ step: 0, picks: [{ choice: OTHER, text: 'אולי' }] }, HEBREU);
    expect(other).toMatch(/<textarea [^>]*dir="auto"[^>]*>אולי<\/textarea>/);
  });

  it('au récapitulatif, la question et sa réponse aussi ; une réponse de plusieurs lignes, ligne par ligne', () => {
    const html = questions({ step: 1, picks: [{ choice: OTHER, text: 'כן.\nOui.' }] }, HEBREU);

    expect(html).toMatch(/<p id="[^"]*-question-0" class="[^"]*" dir="auto">האם המחיר/);
    expect(html).toMatch(
      /<p dir="auto" class="[^"]*whitespace-pre-wrap[^"]*\[unicode-bidi:plaintext\][^"]*">כן\.\nOui\.<\/p>/,
    );
  });

  it('un brouillon de plusieurs paragraphes : chacun dans son sens ; une préférence aussi', () => {
    expect(mailView(HEBREU_PRET)).toMatch(
      /<p dir="auto" class="[^"]*whitespace-pre-wrap[^"]*\[unicode-bidi:plaintext\][^"]*">שלום יעל,\n\nכן, המחיר כולל הכול\.\n\nBien à vous<\/p>/,
    );
    expect(mailView(RETOUCHE)).toMatch(
      /<p id="[^"]*-preference" class="whitespace-pre-wrap[^"]*\[unicode-bidi:plaintext\][^"]*" dir="auto">/,
    );
  });

  it('ses indications pour une relance s’écrivent dans leur sens', () => {
    expect(mailView(SANS_REPONSE)).toMatch(/<textarea [^>]*dir="auto"/);
  });
});

describe('ReplyDrafts : les listes de mails se lisent dans leur sens', () => {
  it('sur l’accueil, le nom est isolé et l’objet prend son sens d’après ses lettres, coupé du bon côté', () => {
    // Le plus ancien des deux : il se range sous la carte du premier.
    const html = render([DEVIS, { ...HEBREU, receivedAt: new Date('2026-11-01T09:00:00Z') }]);

    expect(html).toMatch(/<bdi class="[^"]*">יעל כהן<\/bdi>/);
    expect(html).toMatch(
      /<span dir="auto" class="[^"]*truncate[^"]*">הצעת מחיר – devis bureau<\/span>/,
    );
  });

  it('dans la colonne du panneau aussi', () => {
    view.open = true;
    try {
      const html = render([HEBREU, DEVIS]);
      // Le panneau du test ne dessine pas sa colonne : la liste de l'accueil, panneau ouvert, a les mêmes marques.
      expect(html).toMatch(/<bdi class="[^"]*">Léa Roy<\/bdi>/);
      expect(html).toMatch(/<span dir="auto" class="[^"]*truncate[^"]*">Devis 2027<\/span>/);
    } finally {
      view.open = false;
    }
  });
});

describe('ReplyDrafts : ses mails que Leon a jugés sans réponse à donner', () => {
  // Leur panneau, tel qu'il s'ouvre par « Les voir » : monté sous la pile, avant le panneau de celle-ci.
  const openQuiet = (sansReponse: HomeSansReponse[], locale: 'en' | 'fr' = 'fr') => {
    view.open = true;
    try {
      const html = render([DEVIS], [], locale, 'Julie', sansReponse);
      return html.slice(html.indexOf('<div data-panneau'), html.lastIndexOf('<div data-panneau'));
    } finally {
      view.open = false;
    }
  };

  it('sous la pile, une phrase les compte, et « Les voir » ouvre leur panneau ; la pile ne les montre ni ne les compte', () => {
    const html = render([DEVIS], [], 'fr', 'Julie', [MERCI, TODA]);

    expect(text(html)).toMatch(/Tout traiter 2 mails n’attendent pas votre réponse\. Les voir$/);
    // « Les voir » rappelle la phrase qui dit quoi.
    const said = /<span id="([^"]+)">2 mails n’attendent pas votre réponse\.<\/span>/.exec(
      html,
    )?.[1];
    expect(said).toBeTruthy();
    expect(html).toMatch(
      new RegExp(
        `<button [^>]*aria-haspopup="dialog"[^>]*aria-describedby="${said}"[^>]*>Les voir</button>`,
      ),
    );
    expect(line(html)).toBe('Julie, j’ai quelques questions à vous poser. 1 mail à compléter');
    expect(text(html)).not.toMatch(/Sophie Garnier|אבי מזרחי|Merci pour la visite/);
  });

  it('au singulier ; sans aucun, rien ; quand rien ne l’attend, la phrase suit « Rien ne vous attend »', () => {
    expect(text(render([DEVIS], [], 'fr', 'Julie', [MERCI]))).toMatch(
      /1 mail n’attend pas votre réponse\. Le voir$/,
    );
    expect(text(render([DEVIS]))).not.toMatch(/n’attend/);
    expect(text(render([], [], 'fr', 'Julie', [MERCI, TODA]))).toMatch(
      /puis vous montrera son brouillon\. 2 mails n’attendent pas votre réponse\. Les voir$/,
    );
  });

  it('en anglais, les mêmes mots', () => {
    expect(text(render([DEVIS], [], 'en', 'Julie', [MERCI, TODA]))).toMatch(
      /2 emails need no reply from you\. See them$/,
    );
    expect(text(render([], [], 'en', null, [MERCI]))).toMatch(
      /1 email needs no reply from you\. See it$/,
    );
  });

  it('leur panneau : son titre, la place du mail montré, un seul mail à la fois, « Mail suivant » et « Terminé »', () => {
    const html = openQuiet([MERCI, TODA]);

    expect(html).toContain('<h2>Sans réponse attendue</h2>');
    expect(text(html)).toMatch(
      /^Sans réponse attendue Mail 1 sur 2 Sophie Garnier Reçu le 21 nov\. 2026 · Gmail Merci pour la visite Gmail/,
    );
    expect(count(html, '<div hidden="">')).toBe(1);
    expect(html.indexOf('<div hidden="">')).toBeLessThan(html.indexOf('אבי מזרחי'));
    expect(count(html, 'data-autofocus')).toBe(1);
    // « Terminé » fait partir le mail montré, qu'il rappelle : sans ce geste, les mails vus s'empileraient.
    const foot = html.split('<footer>')[1] ?? '';
    expect(buttons(foot)).toEqual(['Mail suivant', 'Terminé']);
    expect(foot).toMatch(
      new RegExp(`<button [^>]*aria-describedby="sans-reponse-${MERCI.id}"[^>]*>Terminé</button>`),
    );
    // Le panneau de la pile, lui, ne les reçoit pas.
    expect(openQuiet([MERCI], 'en')).toContain('<h2>No reply needed</h2>');
    expect(buttons(openQuiet([MERCI]).split('<footer>')[1] ?? '')).toEqual(['Terminé']);
    expect(buttons(openQuiet([MERCI], 'en').split('<footer>')[1] ?? '')).toEqual(['Done']);
  });
});

describe('MailView : un mail jugé sans réponse à donner', () => {
  it('qui écrit, quand, le fil, le début du mail, puis ses indications, « Préparer une réponse » et « Supprimer le mail »', () => {
    const html = quietView(MERCI);
    const words = `sans-reponse-${MERCI.id}`;

    expect(html).toMatch(
      new RegExp(
        `^<div><div id="${words}" tabindex="-1" data-autofocus="" aria-describedby="place"[^>]*><h3[^>]*><bdi>Sophie Garnier</bdi></h3>`,
      ),
    );
    expect(text(html)).toBe(
      'Sophie Garnier Reçu le 21 nov. 2026 · Gmail Merci pour la visite Gmail Voir le mail Bonjour Julie, Merci pour la visite. Vos indications Ce que vous voulez répondre, en quelques mots. Vous pouvez laisser vide. Préparer une réponse Supprimer le mail',
    );
    expect(buttons(html)).toEqual(['Voir le mail', 'Préparer une réponse', 'Supprimer le mail']);
    // « Supprimer le mail » n'y est qu'une fois, à côté de « Préparer une réponse » ; « Garder » lui rendra le focus.
    expect(count(html, 'Supprimer le mail')).toBe(1);
    expect(html).toContain(`id="${words}-supprimer"`);
    expect(count(html, `aria-describedby="${words}"`)).toBe(2);
    const field = /<label for="([^"]+)"[^>]*>Vos indications<\/label>/.exec(html)?.[1];
    expect(html).toMatch(
      new RegExp(`<textarea rows="2"[^>]*id="${field}"[^>]*dir="auto"[^>]*maxLength="1000"`),
    );
    expect(html).not.toMatch(/Écarter|Voulez-vous|<form|message:/);
  });

  it('un fil Outlook, ou un écran sans ce geste : pas de « Supprimer le mail » ; sans texte lu, ni extrait ni « Voir le mail »', () => {
    const html = quietView(INFO);

    expect(text(html)).toBe(
      'Votre correspondant Reçu le 19 nov. 2026 · Outlook Sans titre Outlook Vos indications Ce que vous voulez répondre, en quelques mots. Vous pouvez laisser vide. Préparer une réponse',
    );
    expect(buttons(quietView(MERCI, 'fr', false))).toEqual([
      'Voir le mail',
      'Préparer une réponse',
    ]);
  });

  it('un mail en hébreu se lit dans son sens ; en anglais, les mêmes mots', () => {
    const html = quietView(TODA);

    expect(html).toMatch(/<h3[^>]*><bdi>אבי מזרחי<\/bdi><\/h3>/);
    expect(html).toMatch(/<p dir="auto" class="[^"]*line-clamp-3[^"]*">שלום דוד/);
    const english = text(quietView(MERCI, 'en'));
    expect(english).toContain(
      'Your instructions What you want to reply, in a few words. You can leave it empty. Prepare a reply Delete email',
    );
  });
});

describe('MailView : son mail resté sans réponse, et la relance', () => {
  it('la question : son mail à son destinataire, resté sans réponse, la date de son envoi, le fil, puis, sur le même écran, « Voulez-vous une relance ? », ses indications, « Préparer la relance » et « Non »', () => {
    const html = mailView(SANS_REPONSE);
    const words = `relance-${SANS_REPONSE.mail.sourceId}`;

    expect(html).toMatch(
      new RegExp(
        `^<div><div id="${words}" tabindex="-1" data-autofocus="" aria-describedby="place"[^>]*><h3[^>]*>Votre mail à Léa Roy est resté sans réponse\\.</h3>`,
      ),
    );
    expect(text(html)).toContain('Envoyé le 14 nov. 2026');
    expect(html).toContain('dateTime="2026-11-14T09:00:00.000Z"');
    expect(html).toContain('href="https://mail.google.test/9"');
    // Une seule étape : rien n'est caché derrière un « Oui ».
    expect(text(html)).toContain(
      'Voulez-vous une relance ? Vos indications Ce que vous voulez ajouter, en quelques mots. Vous pouvez laisser vide. Préparer la relance Non',
    );
    expect(html).not.toContain('hidden=""');
    expect(count(html, `aria-describedby="${words}-voir ${words}"`)).toBe(2);
    const field = /<label for="([^"]+)"[^>]*>Vos indications<\/label>/.exec(html)?.[1];
    expect(field).toBeTruthy();
    expect(html).toMatch(
      new RegExp(
        `<textarea rows="2"[^>]*id="${field}"[^>]*aria-describedby="${field}-note"[^>]*maxLength="1000"`,
      ),
    );
    expect(buttons(html)).toEqual(['Préparer la relance', 'Non']);
    expect(html).not.toMatch(/message:|Reçu le|Voulez-vous une réponse|<form/);
  });

  it('avec plusieurs destinataires, le premier et le nombre des autres ; en anglais, les mêmes mots', () => {
    expect(text(mailView(A_PLUSIEURS))).toContain(
      'Votre mail à Léa Roy et 2 autres personnes est resté sans réponse. Envoyé le 14 nov. 2026',
    );
    expect(text(mailView({ ...A_PLUSIEURS, others: 1 }))).toContain(
      'Votre mail à Léa Roy et 1 autre personne est resté sans réponse.',
    );
    const english = text(mailView(SANS_REPONSE, 'en'));
    expect(english).toContain('Your email to Léa Roy has had no reply. Sent on');
    expect(english).toContain('Do you want a follow-up? Your instructions');
    expect(english).toContain('What you want to add, in a few words. You can leave it empty.');
    expect(english).toContain('Prepare the follow-up No');
    expect(text(mailView(A_PLUSIEURS, 'en'))).toContain(
      'Your email to Léa Roy and 2 other people has had no reply.',
    );
    expect(text(mailView({ ...A_PLUSIEURS, others: 1 }, 'en'))).toContain(
      'Your email to Léa Roy and 1 other person has had no reply.',
    );
  });

  it('son oui : Leon écrit sa relance, sous le nom de son destinataire, et « Écarter » vise la ligne de son oui', () => {
    const done = { [`relance-${SANS_REPONSE.mail.sourceId}`]: id(98) };
    const html = mailView(SANS_REPONSE, 'fr', { done });

    expect(html).toMatch(/<h3[^>]*><bdi>Léa Roy<\/bdi><\/h3>/);
    expect(text(html)).toContain('Envoyé le 14 nov. 2026');
    expect(text(html)).toContain('J’écris votre relance. Actualiser Écarter');
    expect(text(html)).not.toMatch(/Voulez-vous une relance|J’écris votre réponse/);
    expect(text(mailView(SANS_REPONSE, 'en', { done }))).toContain(
      'I’m writing your follow-up. Refresh Dismiss',
    );
  });

  it('ses questions, puis la relance prête : comme un brouillon, avec « Relance prête » et « Envoyé le »', () => {
    const asked = text(mailView({ ...DEVIS, relance: true }));
    expect(asked).toContain('Léa Roy Envoyé le 10 nov. 2026');
    expect(asked).toContain('Question 1 sur 2');

    const html = mailView(RELANCE_PRETE);
    expect(text(html)).toContain('Léa Roy Envoyé le 14 nov. 2026');
    expect(text(html)).toContain('Relance prête Bonjour Léa');
    expect(buttons(html)).toEqual(['Copier', 'Écarter']);
    expect(text(html)).not.toMatch(/Brouillon prêt|Reçu le|Déposé/);
    expect(text(mailView(RELANCE_PRETE, 'en'))).toContain('Léa Roy Sent on');
    expect(text(mailView(RELANCE_PRETE, 'en'))).toContain('Follow-up ready');
  });

  it('une relance déposée dans Gmail : « Envoyer », comme une réponse déposée', () => {
    const deposee = mailView({ ...RELANCE_PRETE, depose: true, others: 2 }, 'fr', { send: true });

    expect(buttons(deposee)).toEqual(['Envoyer', 'Copier', 'Écarter']);
    expect(text(deposee)).toContain('Relance prête');
    expect(text(deposee)).toContain('Déposé dans vos brouillons Gmail.');
    expect(buttons(mailView(DEPOSE, 'fr', { send: true }))).toEqual([
      'Envoyer',
      'Copier',
      'Écarter',
    ]);
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
    // Dans la tuile « Autre », sous son libellé, à la fin du groupe de la question.
    expect(html).toMatch(/Autre<\/label><textarea [^>]*>[^<]*<\/textarea><\/div><\/fieldset>/);
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
