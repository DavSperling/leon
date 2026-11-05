import { describe, expect, it } from 'vitest';
import { DEPARTMENT_IDS, DEPARTMENTS } from '@/lib/onboarding';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import {
  chosenTools,
  codeToolsFirst,
  connectQueue,
  defaultChecked,
  nextAfterTools,
  onboardingReady,
  toolStates,
  toolsCookieValue,
} from './tools-model';

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

describe('outils proposés', () => {
  // Branchable en un clic sur ce serveur : c'est tout ce que l'onboarding propose.
  const ready = (id: string, over: object = {}) =>
    ({
      id,
      available: true,
      triedForReal: true,
      oauthReady: true,
      privateRaw: false,
      ...over,
    }) as unknown as CatalogItem;

  it('onboardingReady demande un connecteur et le bouton configuré, pas un vrai essai', () => {
    expect(onboardingReady(ready('gmail'))).toBe(true);
    expect(onboardingReady(ready('notion', { triedForReal: false }))).toBe(true);
    for (const missing of ['available', 'oauthReady'])
      expect(onboardingReady(ready('gmail', { [missing]: false }))).toBe(false);
  });

  it('un outil pas encore proposé mais déjà branché (par moi ou l’équipe) reste proposé', () => {
    const states = toolStates(
      [ready('notion', { available: false }), ready('linear', { oauthReady: false })],
      [conn('notion', { isCreator: true }), conn('linear')],
      [],
    );

    expect(states.map((s) => [s.item.id, s.status, s.ready])).toEqual([
      ['notion', 'mine', true],
      ['linear', 'team', true],
    ]);
  });

  const states = toolStates(
    [
      ready('github'),
      ready('gmail', { privateRaw: true }),
      ready('drive', { privateRaw: true }),
      ready('notion', { oauthReady: false }),
      ready('jira'),
    ],
    [conn('jira'), conn('drive', { isCreator: true })],
    ['github', 'gmail', 'notion', 'jira'] as never,
  );

  it('coche d’abord les conseillés proposés et encore à brancher', () => {
    expect([...defaultChecked(states)]).toEqual(['github', 'gmail']);
  });

  it('la file : mes outils branchés, puis le choix parmi les outils proposés et libres', () => {
    const queue = connectQueue(states, new Set(['gmail', 'notion', 'jira'] as const));

    // Notion n'est pas proposé, Jira est déjà branché par l'équipe, GitHub n'est pas choisi.
    expect(queue.map((s) => s.item.id)).toEqual(['gmail', 'drive']);
  });

  it('ma connexion en erreur entre dans la file, même sans être choisie', () => {
    const broken = toolStates(
      [ready('github')],
      [conn('github', { isCreator: true, status: 'error' })],
      [],
    );

    expect(connectQueue(broken, new Set()).map((s) => [s.item.id, s.broken !== null])).toEqual([
      ['github', true],
    ]);
  });
});

describe('le choix gardé dans un cookie', () => {
  it('se relit pour la même personne, dans l’ordre des outils, sans identifiant inconnu', () => {
    const raw = `${toolsCookieValue('u1', ['gmail', 'github'])},inconnu`;

    expect(chosenTools(raw, 'u1')).toEqual(['github', 'gmail']);
    expect(chosenTools(toolsCookieValue('u1', []), 'u1')).toEqual([]);
  });

  it('ne se relit pas pour une autre personne du même navigateur', () => {
    expect(chosenTools(toolsCookieValue('u1', ['gmail']), 'u2')).toBeNull();
    expect(chosenTools(toolsCookieValue('u1:x', ['gmail']), 'u1')).toBeNull();
  });

  it('ignore un cookie absent ou illisible', () => {
    expect(chosenTools(undefined, 'u1')).toBeNull();
    expect(chosenTools('', 'u1')).toBeNull();
    expect(chosenTools('gmail', 'u1')).toBeNull();
  });
});

// A5 : « Vos outils de code » vient en tête pour un service dont les outils conseillés comprennent GitHub ou GitLab.
describe('codeToolsFirst', () => {
  const catalog = ['github', 'gitlab', 'linear', 'slack', 'drive'].map((id) => tool(id));
  const firstFor = (recommended: readonly string[]) =>
    codeToolsFirst(toolStates(catalog, [], recommended as never));

  it('en tête quand GitHub ou GitLab est conseillé, à la fin sinon', () => {
    expect(firstFor(['github', 'linear'])).toBe(true);
    expect(firstFor(['linear', 'gitlab'])).toBe(true);
    expect(firstFor(['linear', 'slack'])).toBe(false);
    expect(firstFor([])).toBe(false);
  });

  it('suit les outils conseillés de chaque service : l’ingénierie et la data en tête, les autres à la fin', () => {
    const first = DEPARTMENT_IDS.filter((department) => firstFor(DEPARTMENTS[department].tools));

    expect(first).toEqual(['engineering', 'data']);
  });

  it('un GitHub branché ou coché ne change rien : seul le conseil compte', () => {
    const states = toolStates(catalog, [conn('github', { isCreator: true })], ['linear'] as never);

    expect(codeToolsFirst(states)).toBe(false);
  });
});
