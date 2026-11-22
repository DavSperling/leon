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
// erreur. Données inventées : des sources qui n'existent pas.
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

describe('FicheSection : où en est la construction', () => {
  const EMPTY = { lines: [], sources: {} };

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
