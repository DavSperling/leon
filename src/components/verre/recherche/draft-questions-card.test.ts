import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HomeDemande } from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { DraftQuestionsCard } from './draft-questions-card';

// La carte des demandes de Leon, rendue côté serveur (pas de DOM ici) : ce qu'elle montre avant tout geste. Les actions
// importent Better Auth : elles ne sont pas appelées au rendu. Données inventées.
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

const render = (demandes: HomeDemande[], locale: 'en' | 'fr' = 'fr') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(DraftQuestionsCard, { demandes, max: 1000 }),
    }),
  );
// Le texte de l'écran, espaces fines et insécables ramenées à une espace.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/[\s\u00a0\u202f]+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;

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
    // Une liste nommée, une demande par ligne.
    expect(html).toContain('<ul aria-label="Leon a besoin de vous"');
    expect(count(html, '<li ')).toBe(1);
  });

  it('« Oui » ouvre les questions, fermées d’abord ; chaque question nomme son champ, borné, et un bouton envoie ses réponses', () => {
    const html = render([DEVIS]);
    const panel = `demande-${DEVIS.id}-questions`;

    // « Oui » et « Non » se lisent avec la question posée et la demande.
    expect(html).toContain(
      `aria-expanded="false" aria-controls="${panel}" aria-describedby="demande-${DEVIS.id}-voir demande-${DEVIS.id}"`,
    );
    expect(count(html, `aria-describedby="demande-${DEVIS.id}-voir demande-${DEVIS.id}"`)).toBe(2);
    expect(html).toMatch(new RegExp(`<form id="${panel}" hidden=""`));
    const form = html.slice(html.indexOf(`<form id="${panel}"`));
    for (const question of DEVIS.questions) {
      const field = new RegExp(`<label for="([^"]+)"[^>]*>${question.replace('?', '\\?')}</label>`);
      const control = field.exec(form)?.[1];
      expect(control, question).toBeTruthy();
      expect(form).toMatch(new RegExp(`<textarea[^>]* id="${control}"|<textarea id="${control}"`));
    }
    expect(count(form, '<textarea')).toBe(2);
    expect(count(form, 'maxLength="1000"')).toBe(2);
    expect(form).toMatch(/<button[^>]*type="submit"[^>]*>.*Envoyer mes réponses/s);
  });

  it('plusieurs demandes, dans l’ordre reçu ; sans nom de correspondant ni titre de fil, des mots à la place', () => {
    const html = render([DEVIS, CONTRAT]);
    const words = text(html);

    expect(count(html, '<li ')).toBe(2);
    expect(words.indexOf('répondre à Léa Roy')).toBeLessThan(
      words.indexOf('répondre à votre correspondant'),
    );
    expect(words).toContain('Sans titre');
    expect(count(html, '<textarea')).toBe(3);
  });

  it('en anglais, les mêmes mots', () => {
    const words = text(render([DEVIS, CONTRAT], 'en'));

    for (const one of [
      'I need you to reply to Léa Roy',
      'I need you to reply to your correspondent',
      'Received on Nov 10, 2026',
      'Do you want to see my questions? Yes No',
      'Send my answers',
      // Les questions restent dans la langue du mail reçu.
      'Acceptez-vous le rendez-vous de mardi ?',
      'Can you sign before Friday?',
    ])
      expect(words, one).toContain(one);
    expect(render([DEVIS], 'en')).toContain('<ul aria-label="Leon needs you"');
  });
});
