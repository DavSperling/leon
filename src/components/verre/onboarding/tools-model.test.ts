import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { defaultChecked, nextAfterTools, savedChecked, toolStates } from './tools-model';

// Seuls les champs que le modèle lit : le reste du catalogue et des connexions n'entre pas en jeu.
const tool = (id: string, privateRaw = false) => ({ id, privateRaw }) as unknown as CatalogItem;
const CATALOG = [tool('github'), tool('linear'), tool('jira'), tool('notion'), tool('gmail', true)];

const conn = (provider: string, over: Partial<ConnectionView> = {}) =>
  ({
    provider,
    status: 'active',
    createdBy: { id: 'u2', name: 'Inès' },
    isCreator: false,
    creatorLeft: false,
    ...over,
  }) as unknown as ConnectionView;

const stateOf = (conns: ConnectionView[], id: string, recommended: string[] = []) => {
  const found = toolStates(CATALOG, conns, recommended as never).find((s) => s.item.id === id);
  if (!found) throw new Error(`outil absent : ${id}`);
  return found;
};

describe('toolStates', () => {
  it('sans connexion, tout est à brancher et suit l’ordre du catalogue', () => {
    const states = toolStates(CATALOG, [], []);

    expect(states.map((s) => s.item.id)).toEqual(['github', 'linear', 'jira', 'notion', 'gmail']);
    expect(states.every((s) => s.status === 'free' && s.connectedBy === null)).toBe(true);
  });

  it('le Gmail d’un collègue reste à brancher pour moi (texte privé)', () => {
    expect(stateOf([conn('gmail')], 'gmail')).toMatchObject({ status: 'free', connectedBy: null });
  });

  it('le GitHub d’un collègue présent est branché pour l’équipe, avec son nom', () => {
    expect(stateOf([conn('github')], 'github')).toMatchObject({
      status: 'team',
      connectedBy: 'Inès',
    });
  });

  it('le GitHub d’un ancien membre reste à brancher', () => {
    expect(stateOf([conn('github', { creatorLeft: true })], 'github')).toMatchObject({
      status: 'free',
      connectedBy: null,
    });
  });

  it('le Linear d’un collègue en erreur reste à brancher', () => {
    expect(stateOf([conn('linear', { status: 'error' })], 'linear')).toMatchObject({
      status: 'free',
      connectedBy: null,
    });
  });

  it('le Jira en pause d’un collègue compte', () => {
    expect(stateOf([conn('jira', { status: 'paused' })], 'jira')).toMatchObject({
      status: 'team',
      connectedBy: 'Inès',
    });
  });

  it('mon Notion est à moi, sans « branché par »', () => {
    expect(stateOf([conn('notion', { isCreator: true })], 'notion')).toMatchObject({
      status: 'mine',
      connectedBy: null,
    });
  });

  it('un GitHub à moi et à un collègue est à moi, avec le nom du collègue', () => {
    const conns = [
      conn('github', { isCreator: true, createdBy: { id: 'u1', name: 'Ana' } }),
      conn('github'),
    ];

    expect(stateOf(conns, 'github')).toMatchObject({ status: 'mine', connectedBy: 'Inès' });
  });

  it('le premier collègue présent, sans erreur, donne son nom', () => {
    const conns = [
      conn('github', { status: 'error', createdBy: { id: 'u3', name: 'Léa' } }),
      conn('github', { creatorLeft: true, createdBy: { id: 'u4', name: 'Max' } }),
      conn('github', { createdBy: { id: 'u5', name: 'Sam' } }),
      conn('github'),
    ];

    expect(stateOf(conns, 'github').connectedBy).toBe('Sam');
  });

  it('une connexion à moi seule ne compte pas comme celle d’un collègue, même en pause', () => {
    const mineOnly = [conn('jira', { isCreator: true, status: 'paused' })];

    expect(stateOf(mineOnly, 'jira')).toMatchObject({ status: 'mine', connectedBy: null });
  });

  it('ma connexion en erreur reste à moi, et c’est elle qui est à rebrancher', () => {
    const broken = conn('github', { isCreator: true, status: 'error' });

    expect(stateOf([broken], 'github')).toMatchObject({ status: 'mine', broken });
  });

  it('ma connexion active ou en pause n’est pas à rebrancher', () => {
    for (const status of ['active', 'paused'] as const)
      expect(stateOf([conn('jira', { isCreator: true, status })], 'jira').broken).toBeNull();
  });

  it('la connexion en erreur d’un collègue n’est jamais à rebrancher par moi', () => {
    expect(stateOf([conn('linear', { status: 'error' })], 'linear').broken).toBeNull();
    expect(
      stateOf([conn('github', { isCreator: true }), conn('github', { status: 'error' })], 'github')
        .broken,
    ).toBeNull();
  });

  it('les connexions d’un autre outil ne comptent pas', () => {
    expect(stateOf([conn('github')], 'linear')).toMatchObject({
      status: 'free',
      connectedBy: null,
    });
  });

  it('recommended suit la liste', () => {
    const states = toolStates(CATALOG, [], ['linear', 'github']);

    expect(states.map((s) => [s.item.id, s.recommended])).toEqual([
      ['github', true],
      ['linear', true],
      ['jira', false],
      ['notion', false],
      ['gmail', false],
    ]);
  });
});

describe('nextAfterTools', () => {
  it('un propriétaire seul passe aux collaborateurs', () => {
    expect(nextAfterTools(true)).toBe('/bienvenue/collaborateurs');
  });

  it('tous les autres vont à la fin', () => {
    expect(nextAfterTools(false)).toBe('/bienvenue/pret');
  });
});

describe('outils cochés', () => {
  const available = (id: string) =>
    ({ id, available: true, privateRaw: false }) as unknown as CatalogItem;
  const states = toolStates(
    [
      available('github'),
      available('linear'),
      available('jira'),
      available('notion'),
      tool('gitlab'),
    ],
    [conn('linear')],
    ['github', 'linear'] as never,
  );

  it('coche d’abord les conseillés encore à brancher', () => {
    expect([...defaultChecked(states)]).toEqual(['github']);
  });

  it('reprend ceux gardés dans l’onglet, sans un outil hors de la liste ni devenu indisponible', () => {
    expect([...(savedChecked(states, '["jira","notion","inconnu","gitlab"]') ?? [])]).toEqual([
      'jira',
      'notion',
    ]);
    expect([...(savedChecked(states, '[]') ?? ['x'])]).toEqual([]);
  });

  it('ignore une valeur absente ou illisible', () => {
    expect(savedChecked(states, null)).toBeNull();
    expect(savedChecked(states, '{"github":true}')).toBeNull();
    expect(savedChecked(states, 'pas du json')).toBeNull();
  });
});
