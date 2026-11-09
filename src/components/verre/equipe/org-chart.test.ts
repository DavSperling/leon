import { describe, expect, it } from 'vitest';
import { type ChartMember, orgView } from './org-chart';

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
