import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminStats } from '@/server/admin/stats';
import { AdminDashboard } from '.';

const day = (jour: string, n: number) => ({
  jour,
  inscriptions: n,
  connexions: n * 2,
  questions: n * 3,
  cout: n / 10,
});
const stats: AdminStats = {
  utilisateurs: { total: 1240, nouveaux7: 12, nouveaux30: 48, deuxFacteurs: 31 },
  actifs: { jour: 40, semaine: 210, mois: 600 },
  organisations: { total: 90, nouvelles30: 6, membresMoyen: 7, actives30: 55 },
  connexions: {
    total: 9000,
    semaine: 700,
    mois: 2800,
    tempsMoyen: 600,
    tempsMedian: 420,
    tempsTotal30: 90000,
  },
  questions: { total: 5000, semaine: 300, mois: 1100, discussions: 800, recherches30: 400 },
  couts: {
    total: 812.5,
    mois: 120.25,
    semaine: 30,
    appels30: 4000,
    nonChiffres30: 3,
    tokensEntree30: 2_500_000,
    tokensSortie30: 400_000,
    parModele: [{ nom: 'haiku', cout: 80, appels: 3000 }],
    parEtape: [{ nom: 'discussion', cout: 60, appels: 1000 }],
  },
  parJour: [day('2026-11-10', 2), day('2026-11-11', 5)],
  connecteurs: [],
  listeOrganisations: [
    {
      nom: 'Atelier',
      creeLe: '2026-10-01',
      membres: 4,
      questions: 50,
      questions30: 12,
      connecteurs: 2,
      derniereActivite: null,
    },
  ],
  derniersInscrits: [],
};

// Le tableau des admins de Leon : en français, chiffres au format fr-FR, rien sous le titre.
describe('AdminDashboard', () => {
  const html = renderToStaticMarkup(
    createElement(AdminDashboard, { stats, now: new Date('2026-11-12T08:00:00Z') }),
  );

  it('garde les huit chiffres, les quatre séries et les listes, en français', () => {
    expect(html).toContain('<h1');
    for (const label of [
      'Utilisateurs',
      'Actifs',
      'Organisations',
      'Dépensé en API (30 jours)',
      'Connexions (30 jours)',
      'Temps passé par connexion',
      'Questions (30 jours)',
      'Coût par question',
    ])
      expect(html).toContain(label);
    expect(html.match(/role="img"/g)).toHaveLength(4);
    expect(html).toContain('1 240');
    expect(html).toContain('Aucun connecteur branché.');
    expect(html).toContain('jamais');
    expect(html).toContain('3 appels à un modèle sans tarif connu ne sont pas chiffrés.');
  });

  it('ne dit rien sous le titre', () => {
    expect(html).not.toContain('Ce qui se passe sur Leon');
    expect(html).not.toContain('LEON_ADMINS');
  });
});
