import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { logError } from '@/server/log';

type Count = { nom: string; cout: number; appels: number };

// Ce que rend statistiques_admin() (0039) : des comptes, et les dix derniers inscrits. Durées en secondes, coûts
// en dollars, dates en ISO.
export type AdminStats = {
  utilisateurs: { total: number; nouveaux7: number; nouveaux30: number; deuxFacteurs: number };
  actifs: { jour: number; semaine: number; mois: number };
  organisations: { total: number; nouvelles30: number; membresMoyen: number; actives30: number };
  connexions: {
    total: number;
    semaine: number;
    mois: number;
    tempsMoyen: number;
    tempsMedian: number;
    tempsTotal30: number;
  };
  questions: {
    total: number;
    semaine: number;
    mois: number;
    discussions: number;
    recherches30: number;
  };
  couts: {
    total: number;
    mois: number;
    semaine: number;
    appels30: number;
    nonChiffres30: number;
    tokensEntree30: number;
    tokensSortie30: number;
    parModele: Count[];
    parEtape: Count[];
  };
  parJour: {
    jour: string;
    inscriptions: number;
    connexions: number;
    questions: number;
    cout: number;
  }[];
  connecteurs: { nom: string; total: number; organisations: number }[];
  listeOrganisations: {
    nom: string;
    creeLe: string;
    membres: number;
    questions: number;
    questions30: number;
    connecteurs: number;
    derniereActivite: string | null;
  }[];
  derniersInscrits: {
    nom: string;
    email: string;
    creeLe: string;
    organisation: string | null;
    derniereActivite: string | null;
  }[];
};

export async function adminStats(): Promise<AdminStats> {
  const { rows } = await pool.query<{ stats: AdminStats }>('select statistiques_admin() as stats');
  return (rows[0] as { stats: AdminStats }).stats;
}

// Les admins de Leon : les e-mails de LEON_ADMINS, sans casse.
export function isAdmin(email: string): boolean {
  return env.LEON_ADMINS.includes(email.toLowerCase());
}

// Une écriture par session et par minute au plus : la base ne voit pas chaque requête.
const lastNoted = new Map<string, number>();

export function noteActivity(sessionId: string, userId: string, now = Date.now()): void {
  if (now - (lastNoted.get(sessionId) ?? 0) < 60_000) return;
  // shortcut: vidée d'un bloc à 10 000 sessions, à remplacer par un LRU si Leon en sert autant.
  if (lastNoted.size >= 10_000) lastNoted.clear();
  lastNoted.set(sessionId, now);
  // Sans attendre : la page ne doit ni ralentir ni échouer à cause du journal.
  void pool
    .query('select noter_activite($1, $2)', [sessionId, userId])
    .catch((error) => logError('admin.noter_activite', error));
}
