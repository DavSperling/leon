import { describe, expect, it } from 'vitest';
import type { TaskEventKind } from '@/lib/enums';
import type { ActivityItem } from '@/server/tasks/activity';
import { actorLabel, eventText } from './event-text';

const PAUL = { id: 'paul', name: 'Paul Martin', initials: 'PM' };
const NAMES = new Map([['paul', 'Paul Martin']]);

const item = (kind: TaskEventKind, payload: ActivityItem['payload'] = {}): ActivityItem => ({
  id: 'event',
  taskRef: 'LEO-12',
  taskTitle: 'Titre',
  kind,
  actor: PAUL,
  actorKind: 'user',
  client: null,
  payload,
  body: null,
  createdAt: new Date('2026-10-15T10:00:00Z'),
});

describe('actorLabel', () => {
  it('nomme une personne', () => {
    expect(actorLabel(item('created'))).toBe('Paul Martin');
  });

  it('écrit un agent « Claude Code (agent) », et garde le nom d’un client inconnu', () => {
    const agent = { ...item('created'), actorKind: 'agent' as const, actor: PAUL };
    expect(actorLabel({ ...agent, client: 'claude-code' })).toBe('Claude Code (agent)');
    expect(actorLabel({ ...agent, client: 'cursor' })).toBe('cursor (agent)');
    expect(actorLabel({ ...agent, client: null })).toBe('mcp (agent)');
  });

  it('dit d’un compte supprimé qu’il l’est', () => {
    expect(actorLabel({ ...item('created'), actor: null })).toBe('Compte supprimé');
  });
});

describe('eventText', () => {
  const text = (kind: TaskEventKind, payload?: ActivityItem['payload']) =>
    eventText(item(kind, payload), NAMES);

  it('écrit un changement de statut comme le contrat C8', () => {
    expect(text('status', { from: 'À faire', to: 'En cours' })).toBe(
      'a changé le statut : À faire → En cours',
    );
  });

  it('traduit les priorités et les échéances', () => {
    expect(text('priority', { from: 'none', to: 'urgent' })).toBe(
      'a changé la priorité : Sans priorité → Urgente',
    );
    expect(text('due_date', { from: null, to: '2026-10-16' })).toBe(
      'a changé l’échéance : aucune → ven. 16 oct.',
    );
  });

  it('nomme l’assigné d’après son identifiant', () => {
    expect(text('assignee', { from: null, to: 'paul' })).toBe(
      'a changé l’assigné : personne → Paul Martin',
    );
    expect(text('assignee', { from: 'paul', to: 'parti' })).toBe(
      'a changé l’assigné : Paul Martin → un ancien membre',
    );
  });

  it('écrit les étiquettes ajoutées et retirées', () => {
    expect(text('labels', { added: ['Bug'], removed: [] })).toBe('a ajouté l’étiquette Bug');
    expect(text('labels', { added: ['Bug', 'Urgent'], removed: ['Idée'] })).toBe(
      'a ajouté les étiquettes Bug, Urgent, a retiré l’étiquette Idée',
    );
  });

  it('écrit le parent, le projet et le titre', () => {
    expect(text('parent', { from: null, to: 'LEO-3' })).toBe('a changé le parent : aucun → LEO-3');
    expect(text('project', { from: 'LEO-12', to: 'ATE-3' })).toBe(
      'a changé de projet : LEO-12 → ATE-3',
    );
    expect(text('title', { from: 'Avant', to: 'Après' })).toBe(
      'a changé le titre : « Avant » → « Après »',
    );
  });

  it('écrit les événements sans valeur', () => {
    expect(text('created')).toBe('a créé la tâche');
    expect(text('description')).toBe('a modifié la description');
    expect(text('comment', { commentId: 'x' })).toBe('a commenté');
  });

  it('ne casse pas sur une charge inattendue', () => {
    expect(text('status', { from: 3 })).toBe('a changé le statut : ? → ?');
    expect(text('labels', { added: 'Bug' })).toBe('');
  });
});
