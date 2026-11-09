import { describe, expect, it } from 'vitest';
import { type ChartMember, chartRoots } from './org-chart';

const m = (id: string, managerId: string | null = null): ChartMember => ({
  id,
  name: id,
  managerId,
  department: null,
  job: null,
  self: false,
});

describe('chartRoots', () => {
  it('range chacun sous son manager, par nom, et met en tête les racines qui ont une équipe', () => {
    const { roots, children } = chartRoots([
      m('Zoé'),
      m('Inès', 'Marc'),
      m('Bob', 'Marc'),
      m('Marc'),
      m('Léa', 'Inès'),
    ]);
    expect(roots.map((r) => r.id)).toEqual(['Marc', 'Zoé']);
    expect(children.get('Marc')?.map((c) => c.id)).toEqual(['Bob', 'Inès']);
    expect(children.get('Inès')?.map((c) => c.id)).toEqual(['Léa']);
  });

  it("fait une racine de qui est rattaché à quelqu'un qui n'est plus là", () => {
    const { roots, children } = chartRoots([m('Inès', 'parti')]);
    expect(roots.map((r) => r.id)).toEqual(['Inès']);
    expect(children.size).toBe(0);
  });
});
