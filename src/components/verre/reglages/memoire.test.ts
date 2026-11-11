import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryLesson, MemoryNote, MemoryThread } from '@/server/memory/memory-section';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { ALL_REPOS, MemorySection, outcomeOf, projectOf } from './memoire';

// Les actions importent Better Auth : seul le dessin de la section se teste ici, et les décisions pures qu'elle prend.
vi.mock('@/app/(app)/reglages/actions', () => ({
  writeLessonAction: vi.fn(),
  correctLessonAction: vi.fn(),
  retireLessonAction: vi.fn(),
  restoreMemoryVersionAction: vi.fn(),
  readMemoryVersionAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const DAY = new Date('2026-11-10T09:00:00Z');
const version = (n: number, over: Partial<MemoryThread['versions'][number]> = {}) => ({
  n,
  creeLe: DAY,
  ecritPar: 'modele' as const,
  motif: 'rangement' as const,
  ...over,
});
const THREAD: MemoryThread = {
  id: '11111111-1111-4111-8111-111111111111',
  titre: 'Refonte du rappel',
  projet: 'github.com/acme/app',
  absorbe: false,
  n: 2,
  versions: [version(1), version(2, { ecritPar: 'humain', motif: 'restauration' })],
};
const MERGED: MemoryThread = {
  ...THREAD,
  id: '22222222-2222-4222-8222-222222222222',
  titre: 'Ancien fil',
  absorbe: true,
  n: 0,
  versions: [],
};
const LESSON: MemoryLesson = {
  id: '33333333-3333-4333-8333-333333333333',
  projet: null,
  texte: 'Lancer pnpm test:db avant de pousser.',
  n: 2,
  accepteeLe: DAY,
  versions: [version(1, { ecritPar: 'humain', motif: 'acceptation' }), version(2)],
};

const NOTE: MemoryNote = {
  id: '44444444-4444-4444-8444-444444444444',
  titre: 'Le cache tombe le lundi matin.',
  outil: 'Claude Code',
  projet: 'github.com/acme/app',
  creeLe: DAY,
  n: 2,
  versions: [
    version(1, { ecritPar: 'agent', motif: 'note' }),
    version(2, { ecritPar: 'agent', motif: 'note' }),
  ],
};
const WEB_NOTE: MemoryNote = {
  ...NOTE,
  id: '55555555-5555-4555-8555-555555555555',
  titre: 'Relire le plan.',
  outil: 'claude-ai',
  projet: null,
  n: 1,
  versions: [version(1, { ecritPar: 'agent', motif: 'note' })],
};

type Props = Parameters<typeof MemorySection>[0];
const render = (props: Partial<Props> = {}, locale: 'en' | 'fr' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(MemorySection, {
        recent: true,
        max: 300,
        data: {
          threads: [THREAD, MERGED],
          lessons: [LESSON],
          notes: [NOTE, WEB_NOTE],
          repos: ['github.com/acme/app'],
        },
        ...props,
      }),
    }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// La ligne de l'historique de la version n d'un fil ou d'une leçon, reconnue à son panneau.
const versionRow = (html: string, id: string, n: number) =>
  text(html.split('<li').find((part) => part.includes(`id="version-${id}-${n}"`)) ?? '');

describe('outcomeOf : ce que la section fait d’une réponse des actions', () => {
  it('un succès ne rend aucune erreur', () => {
    expect(outcomeOf({ ok: true })).toEqual({ kind: 'ok' });
  });

  it('« reconnexion » demande la reconnexion, sans erreur ni rechargement', () => {
    expect(outcomeOf({ error: 'reconnexion' })).toEqual({ kind: 'reconnect' });
  });

  it('« modifiée entre-temps » est une erreur claire, et la liste se recharge', () => {
    expect(outcomeOf({ error: 'modifiee' })).toEqual({
      kind: 'error',
      message: 'errorModified',
      reload: true,
    });
  });

  it('introuvable recharge aussi ; invalide et le reste ne rechargent pas', () => {
    expect(outcomeOf({ error: 'introuvable' })).toEqual({
      kind: 'error',
      message: 'errorNotFound',
      reload: true,
    });
    expect(outcomeOf({ error: 'invalide' })).toEqual({
      kind: 'error',
      message: 'errorInvalid',
      reload: false,
    });
    expect(outcomeOf({ error: 'autre' })).toEqual({
      kind: 'error',
      message: 'errorFailed',
      reload: false,
    });
  });
});

describe('projectOf : le dépôt choisi pour une leçon', () => {
  it('« tous mes dépôts » est null, un dépôt est lui-même', () => {
    expect(projectOf(ALL_REPOS)).toBeNull();
    expect(projectOf('github.com/acme/app')).toBe('github.com/acme/app');
  });
});

describe('MemorySection', () => {
  it('montre les leçons : texte, dépôt, date, et le compte des caractères du champ', () => {
    const html = render();
    expect(text(html)).toContain('Lancer pnpm test:db avant de pousser.');
    expect(text(html)).toContain('All my repositories');
    expect(text(html)).toContain('0 / 300');
    expect(html).toContain('dateTime="2026-11-10T09:00:00.000Z"');
  });

  it('chaque champ a son libellé relié, et le choix du dépôt part de « tous mes dépôts »', () => {
    const html = render();
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>New lesson<\/label>/);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Repository<\/label>/);
    expect(html).toContain('maxLength="300"');
  });

  it('montre les fils, absorbés compris, avec leur historique à ouvrir', () => {
    const html = render();
    expect(text(html)).toContain('Refonte du rappel');
    expect(text(html)).toContain('Ancien fil');
    expect(text(html)).toContain('Merged into another thread');
    expect(text(html)).toContain('acme/app');
    expect(html).toContain('aria-expanded="false"');
  });

  it('sans connexion récente : « Reconnectez-vous » et le lien de retour, ni champ d’écriture, ni « Corriger »', () => {
    const html = render({ recent: false });
    expect(text(html)).toContain('Sign in again to write');
    expect(html).toContain('href="/connexion?retour=memoire"');
    expect(html).not.toContain('New lesson');
    expect(text(html)).not.toContain('Edit');
    // retirer reste possible (D37)
    expect(text(html)).toContain('Remove');
  });

  it('avec une connexion récente, pas de message de reconnexion, « Corriger » et « Retirer » sont là', () => {
    const html = render();
    expect(html).not.toContain('retour=memoire');
    expect(text(html)).toContain('Edit');
    expect(text(html)).toContain('Remove');
  });

  it('relie « Corriger », « Retirer » et « Historique » au texte de leur leçon, ou au titre de leur fil', () => {
    const html = render();
    expect(html).toContain(`id="texte-${LESSON.id}"`);
    expect(html.split(`aria-describedby="texte-${LESSON.id}"`).length - 1).toBe(3);
    expect(html).toContain(`id="titre-${THREAD.id}"`);
    expect(html).toContain(`aria-describedby="titre-${THREAD.id}"`);
  });

  it('« Remettre cette version » sur une version ancienne, jamais sur la dernière', () => {
    const html = render();
    expect(versionRow(html, THREAD.id, 1)).toContain('Put this version back');
    expect(versionRow(html, THREAD.id, 2)).toContain('(latest)');
    expect(versionRow(html, THREAD.id, 2)).not.toContain('Put this version back');
    expect(versionRow(html, LESSON.id, 1)).toContain('Put this version back');
    expect(versionRow(html, LESSON.id, 2)).not.toContain('Put this version back');
  });

  it('la dernière version d’un fil illisible : « Remettre » sur toutes les versions montrées, aucune n’est « dernière »', () => {
    const html = render({
      data: { threads: [{ ...THREAD, n: 3 }], lessons: [], notes: [], repos: [] },
    });
    expect(versionRow(html, THREAD.id, 1)).toContain('Put this version back');
    expect(versionRow(html, THREAD.id, 2)).toContain('Put this version back');
    expect(versionRow(html, THREAD.id, 2)).not.toContain('(latest)');
  });

  it('sans connexion récente, aucun « Remettre cette version », même pour un fil d’une seule version lisible', () => {
    const html = render({
      recent: false,
      data: {
        threads: [{ ...THREAD, n: 3, versions: [version(1)] }],
        lessons: [LESSON],
        notes: [],
        repos: [],
      },
    });
    expect(text(html)).not.toContain('Put this version back');
    // « Reconnectez-vous » : une fois pour les leçons, une fois pour le fil, qui a une version à remettre.
    expect(html.split('href="/connexion?retour=memoire"').length - 1).toBe(2);
    // Celui des fils ne parle que de remettre une version, pas de retirer une leçon.
    expect(text(html)).toContain('Sign in again to put back a version.');
    expect(text(html).split('You can still remove a lesson.').length - 1).toBe(1);
  });

  it('sans leçon, fil ni note : trois états vides', () => {
    const html = render({ data: { threads: [], lessons: [], notes: [], repos: [] } });
    expect(text(html)).toContain('No lesson yet.');
    expect(text(html)).toContain('No work thread yet.');
    expect(text(html)).toContain('No agent note yet.');
  });

  it('montre les notes de l’agent après les fils : début du texte, outil, dépôt s’il y en a un, date', () => {
    const html = render();
    const notes = text(html.slice(html.indexOf('Agent notes')));
    expect(html.indexOf('Work threads')).toBeLessThan(html.indexOf('Agent notes'));
    expect(notes).toContain('Le cache tombe le lundi matin.');
    expect(notes).toContain('Claude Code');
    expect(notes).toContain('acme/app');
    expect(notes).toContain('Written');
    expect(notes).toContain('Relire le plan.');
    expect(notes).toContain('claude-ai');
    expect(html).toContain('dateTime="2026-11-10T09:00:00.000Z"');
    // une note sans dépôt n'en montre pas : le seul « acme/app » de la partie est celui de la première
    expect(notes.split('acme/app').length - 1).toBe(1);
  });

  it('relie « Historique » au début du texte de sa note, et « Remettre » : jamais sur la dernière version', () => {
    const html = render();
    expect(html).toContain(`id="note-${NOTE.id}"`);
    expect(html).toContain(`aria-describedby="note-${NOTE.id}"`);
    expect(versionRow(html, NOTE.id, 1)).toContain('Put this version back');
    expect(versionRow(html, NOTE.id, 1)).toContain('An agent');
    expect(versionRow(html, NOTE.id, 2)).toContain('(latest)');
    expect(versionRow(html, NOTE.id, 2)).not.toContain('Put this version back');
    expect(versionRow(html, WEB_NOTE.id, 1)).not.toContain('Put this version back');
  });

  it('sans connexion récente : aucun « Remettre » pour une note, et un avis qui ne parle que de remettre une version', () => {
    const html = render({
      recent: false,
      data: { threads: [], lessons: [], notes: [NOTE], repos: [] },
    });
    expect(text(html)).not.toContain('Put this version back');
    const notes = text(html.slice(html.indexOf('Agent notes')));
    expect(notes).toContain('Sign in again to put back a version.');
    expect(notes).not.toContain('remove a lesson');
    expect(html).toContain('href="/connexion?retour=memoire"');
  });

  it('sans connexion récente, une note sans version à remettre ne demande pas de reconnexion', () => {
    const html = render({
      recent: false,
      data: { threads: [], lessons: [], notes: [WEB_NOTE], repos: [] },
    });
    const notes = text(html.slice(html.indexOf('Agent notes')));
    expect(notes).not.toContain('Sign in again');
  });

  it('une lecture en échec : une erreur annoncée, ni liste ni champ', () => {
    const html = render({ data: null });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Couldn’t load your memory');
    expect(html).not.toContain('<textarea');
  });

  it('se dessine en français avec les mêmes clés', () => {
    const html = render({}, 'fr');
    expect(text(html)).toContain('Leçons');
    expect(text(html)).toContain('Fils de travail');
    expect(text(html)).toContain('Tous mes dépôts');
    expect(text(html)).toContain('Notes de l’agent');
    expect(text(html)).toContain('Écrite le');
  });
});
