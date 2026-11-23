import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { type Flow, OTHER, startFlow } from '@/lib/draft-questions';
import type { FicheBrouillon, HomeDemande } from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { DraftQuestionsCard, Questions } from './draft-questions-card';

// La carte de l'agent « Brouillons de réponse » sur l'Accueil, rendue côté serveur (pas de DOM ici, donc pas de clic) :
// ce qu'elle montre avant tout geste, et les questions de Leon dessinées dans un état donné. Passer d'un état à l'autre
// se teste sans écran (lib/draft-questions.test.ts). Les actions importent Better Auth : elles ne sont pas appelées au
// rendu. Données inventées.
vi.mock('@/app/(app)/settings/actions', () => ({
  answerQuestionsAction: vi.fn(),
  discardBrouillonAction: vi.fn(),
}));

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

const within = (children: ReactNode, locale: 'en' | 'fr') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      children,
    }),
  );
const render = (
  demandes: HomeDemande[],
  locale: 'en' | 'fr' = 'fr',
  prets: FicheBrouillon[] = [],
) => within(createElement(DraftQuestionsCard, { demandes, prets, max: 1000 }), locale);
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
    .replace(/[\s\u00a0\u202f]+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
// Les libellés des boutons, dans l'ordre.
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map((match) => match[1]);
// Les boutons radio, dans l'ordre : cochés ou non.
const radios = (html: string) =>
  [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0].includes('checked=""'));

describe('DraftQuestionsCard : les demandes de Leon sur l’Accueil', () => {
  it('sans demande, rien ne se montre', () => {
    expect(render([])).toBe('');
  });

  it('dit pour qui Leon a besoin d’elle, la date du mail reçu et le fil lié à son outil, puis demande si elle veut voir ses questions', () => {
    const html = render([DEVIS]);
    const words = text(html);

    expect(words).toContain('J’ai besoin de vous pour répondre à Léa Roy');
    expect(words).toContain('Reçu le 10 nov. 2026');
    expect(html).toContain('href="https://mail.google.test/2"');
    expect(words).toContain('Devis 2027');
    expect(words).toContain('Voulez-vous voir mes questions ? Oui Non');
    // « Oui » et « Non » se lisent avec la question posée et la demande.
    expect(count(html, `aria-describedby="demande-${DEVIS.id}-voir demande-${DEVIS.id}"`)).toBe(2);
    // Une liste nommée, une demande par ligne.
    expect(html).toContain('<ul aria-label="Leon a besoin de vous"');
    expect(count(html, '<li class="px-3')).toBe(1);
  });

  it('« Oui » ouvre les questions, fermées d’abord : la première question seule, sa place, ses choix en boutons radio, et « Autre »', () => {
    const html = render([DEVIS]);
    const panel = `demande-${DEVIS.id}-questions`;

    expect(html).toContain(`<div id="${panel}" hidden=""`);
    const shown = html.slice(html.indexOf(`<div id="${panel}"`));
    // Un groupe de boutons radio, sa légende : la place de la question, puis la question.
    expect(shown).toMatch(
      new RegExp(
        `<fieldset id="${panel}-etape" tabindex="-1"[^>]*><legend[^>]*><span[^>]*>Question 1 sur 2</span><span[^>]*>Acceptez-vous le rendez-vous de mardi \\?</span></legend>`,
      ),
    );
    expect(text(shown)).toContain('Oui Non, proposer jeudi Autre');
    expect(text(shown)).not.toContain('Quel prix lui annoncer');
    // Rien de retenu d'avance, et un seul nom pour le groupe : un seul choix se retient à la fois.
    expect(radios(shown)).toEqual([false, false, false]);
    expect(count(shown, `name="${panel}-etape"`)).toBe(3);
    // Chaque bouton radio est dans son libellé.
    expect(shown).toMatch(/<label[^>]*><input type="radio"[^>]*>Non, proposer jeudi<\/label>/);
    expect(shown).toMatch(/<label[^>]*><input type="radio"[^>]*>Autre<\/label>/);
    // Le texte libre ne s'ouvre qu'avec « Autre ».
    expect(shown).not.toContain('<textarea');
    // Ni retour sur la première question, ni envoi avant le récapitulatif ; « Écarter » rappelle la demande.
    expect(buttons(shown)).toEqual(['Suivant', 'Écarter']);
    expect(shown).toMatch(
      new RegExp(`<button [^>]*aria-describedby="demande-${DEVIS.id}"[^>]*>Écarter`),
    );
    // Pas de formulaire : « Entrée » sur un choix n'envoie rien.
    expect(html).not.toContain('<form');
  });

  it('plusieurs demandes, dans l’ordre reçu ; sans nom de correspondant ni titre de fil, des mots à la place', () => {
    const html = render([DEVIS, CONTRAT]);
    const words = text(html);

    expect(count(html, '<li class="px-3')).toBe(2);
    expect(words.indexOf('répondre à Léa Roy')).toBeLessThan(
      words.indexOf('répondre à votre correspondant'),
    );
    expect(words).toContain('Sans titre');
    // Une question à la fois par demande, chacune avec son propre groupe.
    expect(count(html, '<fieldset')).toBe(2);
    expect(html).toContain(`name="demande-${CONTRAT.id}-questions-etape"`);
  });

  it('en anglais, les mêmes mots', () => {
    const words = text(render([DEVIS, CONTRAT], 'en'));

    for (const one of [
      'I need you to reply to Léa Roy',
      'I need you to reply to your correspondent',
      'Received on Nov 10, 2026',
      'Do you want to see my questions? Yes No',
      'Question 1 of 2',
      'Question 1 of 1',
      'Other',
      'Next',
      'Dismiss',
      // Les questions et leurs choix restent dans la langue du mail reçu.
      'Acceptez-vous le rendez-vous de mardi ?',
      'Non, proposer jeudi',
      'Can you sign before Friday?',
    ])
      expect(words, one).toContain(one);
    expect(render([DEVIS], 'en')).toContain('<ul aria-label="Leon needs you"');
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

describe('DraftQuestionsCard : les brouillons prêts sur l’Accueil', () => {
  const PRET: FicheBrouillon = {
    id: id(701),
    from: 'Léa Roy',
    receivedAt: new Date('2026-11-20T08:30:00Z'),
    texte: 'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] <b>.\n\nBien à vous',
    depose: false,
    source: { title: 'Devis 2027', url: 'https://mail.google.test/fil/1', kind: 'gmail' },
  };
  // Un fil sans objet ni lien, d'un correspondant sans nom ni adresse.
  const SANS_LIEN: FicheBrouillon = {
    id: id(702),
    from: null,
    receivedAt: new Date('2026-11-19T08:30:00Z'),
    texte: 'Bonjour,\n\nBien reçu.',
    depose: false,
    source: { title: null, url: null, kind: 'outlook' },
  };
  // Complet : déposé aussi dans ses brouillons Gmail.
  const DEPOSE: FicheBrouillon = {
    id: id(703),
    from: 'marc@client.test',
    receivedAt: new Date('2026-11-18T08:30:00Z'),
    texte: 'Bonjour Marc,\n\nC’est entendu.',
    depose: true,
    source: { title: 'Contrat', url: 'https://mail.google.test/fil/3', kind: 'gmail' },
  };
  const ALL = [PRET, SANS_LIEN, DEPOSE];
  const row = (html: string, one: FicheBrouillon) =>
    html
      .split('<li class="px-3')
      .find((part) => part.includes(`id="brouillon-${one.id}"`))
      ?.split('</li>')[0] ?? '';

  it('sans demande, les brouillons prêts se montrent seuls, dans une liste nommée, dans l’ordre reçu', () => {
    const html = render([], 'fr', ALL);

    expect(html).not.toContain('Leon a besoin de vous');
    expect(html).toContain('<ul aria-label="Brouillons prêts"');
    expect(count(html, '<li class="px-3')).toBe(3);
    expect(ALL.map((one) => html.indexOf(`id="brouillon-${one.id}"`))).toEqual(
      ALL.map((one) => html.indexOf(`id="brouillon-${one.id}"`)).sort((a, b) => a - b),
    );
  });

  it('les brouillons prêts viennent sous les demandes, chacun dans sa liste', () => {
    const html = render([DEVIS], 'fr', [PRET]);

    expect(html.indexOf('<ul aria-label="Leon a besoin de vous"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('<ul aria-label="Brouillons prêts"')).toBeGreaterThan(
      html.indexOf(`id="demande-${DEVIS.id}-questions"`),
    );
    // Une seule feuille pour les deux listes.
    expect(count(html, 'shadow-sheet')).toBe(1);
  });

  it('chaque brouillon : le correspondant, la date du mail reçu, le fil lié à son outil, et trois gestes', () => {
    const pret = row(render([], 'fr', ALL), PRET);

    expect(text(pret)).toContain('Brouillon prêt pour répondre à Léa Roy');
    expect(text(pret)).toContain('Reçu le 20 nov. 2026');
    expect(pret).toContain('dateTime="2026-11-20T08:30:00.000Z"');
    // Le fil, comme les sources d'une tâche : son objet, son outil, et son lien vers l'outil.
    expect(pret).toContain('href="https://mail.google.test/fil/1"');
    expect(pret).toContain('target="_blank" rel="noopener noreferrer"');
    expect(text(pret)).toContain('Devis 2027');
    expect(text(pret)).toContain('Gmail');
    // Trois gestes, pas un de plus : ni corriger, ni refaire, ni envoyer. Chacun rappelle les mots du brouillon.
    expect(buttons(pret)).toEqual(['Voir le brouillon', 'Copier', 'Écarter']);
    expect(count(pret, `aria-describedby="brouillon-${PRET.id}"`)).toBe(3);
  });

  it('le texte du brouillon est replié derrière « Voir le brouillon », tel quel : ses lignes, ses crochets, et rien qui s’interprète', () => {
    const pret = row(render([], 'fr', ALL), PRET);
    const panel = `brouillon-${PRET.id}-texte`;

    expect(pret).toMatch(
      new RegExp(
        `<button [^>]*aria-expanded="false" aria-controls="${panel}"[^>]*>Voir le brouillon`,
      ),
    );
    expect(pret).toMatch(
      new RegExp(`<p id="${panel}" hidden="" class="[^"]*whitespace-pre-wrap[^"]*">Bonjour Léa,`),
    );
    expect(pret).toContain(
      'Bonjour Léa,\n\nVoici le devis [à compléter : le montant] &lt;b&gt;.\n\nBien à vous',
    );
  });

  it('un brouillon déposé dans Gmail le dit, lui seul, dans les deux langues, sans geste de plus', () => {
    const html = render([], 'fr', ALL);
    const english = render([], 'en', ALL);

    expect(text(row(html, DEPOSE))).toContain('Déposé dans vos brouillons Gmail');
    expect(text(row(english, DEPOSE))).toContain('Saved to your Gmail drafts');
    for (const one of [PRET, SANS_LIEN]) {
      expect(text(row(html, one)), one.id).not.toContain('Déposé');
      expect(text(row(english, one)), one.id).not.toContain('Saved to');
    }
    // La mention fait partie des mots du brouillon, que ses gestes rappellent.
    expect(row(html, DEPOSE)).toMatch(
      new RegExp(`id="brouillon-${DEPOSE.id}"[^]*Déposé dans vos brouillons Gmail</p></div>`),
    );
    expect(buttons(row(html, DEPOSE))).toEqual(['Voir le brouillon', 'Copier', 'Écarter']);
  });

  it('un fil sans objet ni lien se montre sans s’ouvrir ; un correspondant sans nom se lit par son adresse, ou par des mots', () => {
    const html = render([], 'fr', ALL);
    const sansLien = row(html, SANS_LIEN);

    expect(text(sansLien)).toContain('Brouillon prêt pour répondre à votre correspondant');
    expect(text(sansLien)).toContain('Sans titre');
    expect(text(sansLien)).toContain('Outlook');
    expect(sansLien).not.toContain('href=');
    expect(text(row(html, DEPOSE))).toContain('Brouillon prêt pour répondre à marc@client.test');
  });

  it('en anglais, les mêmes mots', () => {
    const html = render([], 'en', ALL);
    const words = text(html);

    for (const one of [
      'Draft ready to reply to Léa Roy',
      'Draft ready to reply to your correspondent',
      'Received on Nov 20, 2026',
      'Untitled',
      'See the draft',
      'Copy',
      'Dismiss',
    ])
      expect(words, one).toContain(one);
    expect(html).toContain('<ul aria-label="Drafts ready"');
    expect(words).not.toMatch(/draftQuestions\.|fiche\./);
  });
});
