import { describe, expect, it } from 'vitest';
import { authorAcl, isTeamAcl, mostRestrictiveAcl, teamAcl, unionAcl } from './acl';

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';

describe('acl', () => {
  it("donne l'ACL d'équipe et l'ACL d'auteur", () => {
    expect(teamAcl(T)).toEqual([T]);
    expect(authorAcl(P)).toEqual([P]);
  });

  it("reconnaît une ACL d'équipe", () => {
    expect(isTeamAcl([T, P], T)).toBe(true);
    expect(isTeamAcl([P], T)).toBe(false);
  });

  it('fait une union dédupliquée et triée', () => {
    expect(unionAcl([T], [P, T])).toEqual([P, T]);
  });

  it("prend l'intersection des publics", () => {
    expect(mostRestrictiveAcl([[T], [T]], T)).toEqual([T]);
    expect(mostRestrictiveAcl([[T], [P]], T)).toEqual([P]);
    expect(mostRestrictiveAcl([[T, P], [P]], T)).toEqual([P]);
    expect(mostRestrictiveAcl([[P], [M]], T)).toEqual([]);
    expect(mostRestrictiveAcl([[T, P]], T)).toEqual([T]);
  });
});
