import { describe, expect, it } from 'vitest';
import { type ChartMember, chartLayout, orgView } from './org-chart';

const m = (id: string, managerId: string | null = null, self = false): ChartMember => ({
  id,
  name: id,
  managerId,
  department: null,
  job: null,
  self,
});
const ids = (list: ChartMember[]) => list.map((x) => x.id);

// Claire dirige Marc et Zoé ; Marc dirige Inès (la lectrice) et Bob ; Inès dirige Hugo ; Léa n'a pas de manager.
// Dans le désordre, pour que les tris servent.
const ORG = [
  m('Léa'),
  m('Zoé', 'Claire'),
  m('Inès', 'Marc', true),
  m('Bob', 'Marc'),
  m('Claire'),
  m('Marc', 'Claire'),
  m('Hugo', 'Inès'),
];

describe('orgView', () => {
  it('part du lecteur : ses managers au-dessus, ses collègues à côté, ses directs, par nom', () => {
    const { focus, chain, row, children } = orgView(ORG, null);
    expect(focus?.id).toBe('Inès');
    expect(ids(chain)).toEqual(['Claire', 'Marc']);
    expect(ids(row)).toEqual(['Bob', 'Inès']);
    expect(ids(children.get('Inès') ?? [])).toEqual(['Hugo']);
  });

  it("se recentre sur une personne choisie ; une racine est dans la rangée des racines, celles qui ont une équipe d'abord", () => {
    expect(ids(orgView(ORG, 'Marc').row)).toEqual(['Marc', 'Zoé']);
    const { chain, row } = orgView(ORG, 'Claire');
    expect(chain).toEqual([]);
    expect(ids(row)).toEqual(['Claire', 'Léa']);
  });

  it("fait une racine de qui est rattaché à quelqu'un qui n'est plus là, et revient au lecteur sur un inconnu", () => {
    const { focus, chain, row } = orgView([m('Zoé'), m('Inès', 'parti', true)], 'inconnu');
    expect(focus?.id).toBe('Inès');
    expect(chain).toEqual([]);
    expect(ids(row)).toEqual(['Inès', 'Zoé']);
  });
});

describe('chartLayout', () => {
  it('met en haut les racines qui ont une équipe ; ceux qui ne sont rattachés à personne vont à part', () => {
    const { top, unplaced, children } = chartLayout(ORG);
    expect(ids(top)).toEqual(['Claire']);
    expect(ids(unplaced)).toEqual(['Léa']);
    expect(ids(children.get('Marc') ?? [])).toEqual(['Bob', 'Inès']);
  });

  it("sans aucun rattachement, le lecteur seul est en haut ; un invité n'y est jamais pris d'office", () => {
    const flat = [m('Zoé'), { ...m('Ana'), invited: true }, m('Inès', null, true)];
    expect(ids(chartLayout(flat).top)).toEqual(['Inès']);
    expect(ids(chartLayout(flat).unplaced)).toEqual(['Ana', 'Zoé']);
    const noSelf = [{ ...m('Ana'), invited: true }, m('Zoé')];
    expect(ids(chartLayout(noSelf).top)).toEqual(['Zoé']);
  });

  it('un manager absent de la liste ne cache personne : la personne devient une racine', () => {
    const { top, unplaced } = chartLayout([m('Bob', 'parti'), m('Hugo', 'Bob')]);
    expect(ids(top)).toEqual(['Bob']);
    expect(unplaced).toEqual([]);
  });
});
