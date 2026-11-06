import { describe, expect, it } from 'vitest';
import { ITEM_NATURES, SOURCE_KINDS, type SourceKind, TOOL_KINDS } from '@/capture/turn';
import { PAGE_MAX } from '@/lib/search-limits';
import type { ContextTurn, SourceHit, SourceInfo } from '@/server/search/types';
import {
  countLabel,
  NATURE_LABELS,
  pageCount,
  queryTerms,
  toolOptions,
  toPreviewView,
  toResultViews,
  unknownPeopleMessage,
} from './view-model';

const hit = (over: Partial<SourceHit> = {}): SourceHit => ({
  sourceId: 's1',
  kind: 'github',
  nature: 'ticket',
  title: 'Renouvellement du contrat OVH',
  url: 'https://github.com/acme/api/issues/12',
  origin: { repo: 'acme/api' },
  lastTs: new Date('2026-10-12T10:00:00Z'),
  passages: [
    {
      passageId: 'p1',
      turnId: 't1',
      snippet: 'le contrat est renouvelé',
      ts: new Date('2026-10-12T10:00:00Z'),
      authorName: 'Julie Martin',
    },
  ],
  score: 0.5,
  ...over,
});

describe('toResultViews', () => {
  it('donne à chaque source ses libellés, son lien et ses passages, sans le score', () => {
    const [view] = toResultViews([hit()]);

    expect(view).toEqual({
      sourceId: 's1',
      kind: 'github',
      kindLabel: 'GitHub',
      natureLabel: 'Ticket',
      title: 'Renouvellement du contrat OVH',
      url: 'https://github.com/acme/api/issues/12',
      originLabel: 'acme/api',
      lastTs: new Date('2026-10-12T10:00:00Z'),
      passages: [
        {
          passageId: 'p1',
          snippet: 'le contrat est renouvelé',
          ts: new Date('2026-10-12T10:00:00Z'),
          authorName: 'Julie Martin',
        },
      ],
    });
  });

  it('nomme une conversation captée « Conversation IA », avec le nom de son outil', () => {
    const [view] = toResultViews([hit({ kind: 'claude_code', nature: 'conversation' })]);

    expect(view).toMatchObject({ kindLabel: 'Claude Code', natureLabel: 'Conversation IA' });
  });

  it('prend la première origine connue, dans l’ordre dépôt, projet, espace, canal…', () => {
    const origin = (o: Record<string, string>) =>
      toResultViews([hit({ origin: o })])[0]?.originLabel;

    expect(origin({ project: 'Atlas', repo: 'acme/api' })).toBe('acme/api');
    expect(origin({ channel: '#general', space: 'Produit' })).toBe('Produit');
    expect(origin({ autre: 'valeur' })).toBe('valeur');
    expect(origin({})).toBeNull();
    expect(origin({ repo: '   ' })).toBeNull();
  });

  it('coupe une origine démesurée', () => {
    const [view] = toResultViews([hit({ origin: { repo: 'x'.repeat(500) } })]);

    expect(view?.originLabel?.length).toBeLessThanOrEqual(60);
  });

  it('garde une source sans titre ni lien, sans passage', () => {
    const [view] = toResultViews([hit({ title: null, url: null, passages: [] })]);

    expect(view).toMatchObject({ title: null, url: null, passages: [] });
  });

  // Depuis 0010, rien en base ne contraint `sources.kind` : une ligne écrite par une autre version du code (un
  // outil retiré, un retour à une image plus ancienne) peut porter un outil que celle-ci ne connaît pas. La
  // page de recherche doit l'afficher, pas tomber.
  it('affiche une source d’un outil inconnu : libellé non vide, icône de repli', () => {
    for (const kind of ['ancien_outil', '', 'constructor', '__proto__']) {
      const [view] = toResultViews([hit({ kind: kind as SourceKind })]);

      expect(view?.kindLabel, `kind=${JSON.stringify(kind)}`).toMatch(/\S/);
      expect(view?.kind, `kind=${JSON.stringify(kind)}`).toBe('other');
    }
    expect(toResultViews([hit({ kind: 'ancien_outil' as SourceKind })])[0]?.kindLabel).toBe(
      'ancien_outil',
    );
  });

  it('garde l’identifiant d’un outil connu, pour son icône', () => {
    for (const kind of SOURCE_KINDS) {
      expect(toResultViews([hit({ kind })])[0]?.kind).toBe(kind);
    }
  });
});

describe('toPreviewView', () => {
  const source: SourceInfo = {
    sourceId: 's1',
    kind: 'fathom',
    nature: 'reunion',
    title: 'Call ACME',
    url: 'https://fathom.video/calls/1',
    origin: {},
    lastTs: new Date('2026-10-12T10:00:00Z'),
  };
  const turn = (over: Partial<ContextTurn>): ContextTurn => ({
    turnId: 't1',
    role: 'participant',
    authorName: 'Bob',
    ts: new Date('2026-10-12T10:00:00Z'),
    text: 'Bonjour',
    isHit: false,
    ...over,
  });

  it('garde les tours dans l’ordre, avec celui du passage marqué', () => {
    const view = toPreviewView({
      source,
      turns: [turn({ turnId: 'a' }), turn({ turnId: 'b', isHit: true }), turn({ turnId: 'c' })],
    });

    expect(view.turns.map((t) => [t.turnId, t.isHit])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
    expect(view).toMatchObject({
      kindLabel: 'Fathom',
      natureLabel: 'Réunion',
      title: 'Call ACME',
      url: 'https://fathom.video/calls/1',
    });
  });

  it('affiche l’aperçu d’une source d’un outil inconnu avec un libellé non vide', () => {
    for (const kind of ['ancien_outil', '', 'constructor']) {
      const view = toPreviewView({ source: { ...source, kind: kind as SourceKind }, turns: [] });

      expect(view.kindLabel, `kind=${JSON.stringify(kind)}`).toMatch(/\S/);
    }
  });

  it('dit qui parle : l’auteur quand l’outil le donne, sinon le rôle', () => {
    const speakers = (turns: ContextTurn[]) =>
      toPreviewView({ source, turns }).turns.map((t) => t.speaker);

    expect(
      speakers([
        turn({ role: 'user', authorName: null }),
        turn({ role: 'assistant', authorName: null }),
        turn({ role: 'document', authorName: null }),
        turn({ role: 'participant', authorName: null }),
        turn({ role: 'document', authorName: 'Julie Martin' }),
        turn({ role: 'participant', authorName: '   ' }),
      ]),
    ).toEqual(['Vous', 'Assistant', 'Document', 'Participant', 'Julie Martin', 'Participant']);
  });
});

describe('queryTerms', () => {
  it('rend les mots de la requête, sans guillemets ni ponctuation', () => {
    expect(queryTerms('contrat "renouvellement OVH" (client)')).toEqual([
      'contrat',
      'renouvellement',
      'OVH',
      'client',
    ]);
  });

  it('laisse de côté les mots exclus, l’opérateur or et les mots trop courts', () => {
    expect(queryTerms('budget -brouillon or de la 42 a')).toEqual(['budget', '42']);
  });

  it('sépare un mot composé, sans doublon ni plus de douze mots', () => {
    expect(queryTerms('contrat-cadre contrat')).toEqual(['contrat', 'cadre']);
    expect(queryTerms(Array.from({ length: 30 }, (_, i) => `mot${i}x`).join(' '))).toHaveLength(12);
  });

  it('ne rend rien pour une requête vide', () => {
    expect(queryTerms('')).toEqual([]);
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('textes de la page', () => {
  it('compte les sources, « environ » au-delà d’une page', () => {
    expect(countLabel(1)).toBe('1 source');
    expect(countLabel(3)).toBe('3 sources');
    expect(countLabel(10)).toBe('10 sources');
    expect(countLabel(37)).toBe('Environ 37 sources');
    expect(countLabel(1234)).toBe('Environ 1 234 sources');
  });

  it('compte les pages de dix sources', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(95)).toBe(10);
    expect(pageCount(100_000)).toBe(PAGE_MAX);
  });

  it('dit que personne ne porte ce nom dans l’équipe', () => {
    expect(unknownPeopleMessage([])).toBeNull();
    expect(unknownPeopleMessage(['Julie'])).toBe('Personne ne s’appelle « Julie » dans l’équipe.');
    expect(unknownPeopleMessage(['Julie', 'Bob'])).toBe(
      'Personne ne s’appelle « Julie » ni « Bob » dans l’équipe.',
    );
    expect(unknownPeopleMessage(['a', 'b', 'c'])).toBe(
      'Personne ne s’appelle « a », « b » ni « c » dans l’équipe.',
    );
  });
});

describe('libellés', () => {
  it('nomme chaque nature de source', () => {
    for (const nature of ITEM_NATURES) {
      expect(NATURE_LABELS[nature], nature).toMatch(/\S/);
    }
  });

  // Les règles du jet : une interface en français, sans anglicisme.
  it('nomme en français la modification de code, sans l’anglicisme « commit »', () => {
    expect(NATURE_LABELS.commit).not.toMatch(/commit/i);
  });

  it('propose chaque outil une fois, avec son identifiant et son libellé, par ordre alphabétique', () => {
    const options = toolOptions();

    // Sans le fil de travail (T39) : ce n'est l'outil de personne, le filtre `outil` ne le connaît pas.
    expect(options).toHaveLength(TOOL_KINDS.length);
    expect(new Set(options.map((o) => o.value))).toEqual(new Set(TOOL_KINDS));
    expect(options.find((o) => o.value === 'claude_code')?.label).toBe('Claude Code');
    const labels = options.map((o) => o.label);
    expect(labels).toEqual(
      [...labels].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    );
  });
});
