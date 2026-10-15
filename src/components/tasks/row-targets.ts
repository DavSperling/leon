import { toast } from 'sonner';

// Où une touche agit dans la page. La tâche visée est celle qui a le focus ; à défaut, celle que le
// pointeur survole (`:hover`, sans rien suivre à la main).

export type PickerKind = 'status' | 'priority' | 'assignee' | 'labels' | 'due';

const ROW = '[data-task-id]'; // une ligne de la liste, une carte du tableau
const BULK_BAR = '[data-bulk-actions]';

export function aimedRow(): HTMLElement | null {
  return (
    document.activeElement?.closest<HTMLElement>('[data-task-id]') ??
    document.querySelector<HTMLElement>(`${ROW}:hover`)
  );
}

// J / K : le focus passe au lien de la tâche suivante ou précédente, dans l'ordre de la page. Faux
// quand la page n'en montre aucune : la touche garde alors son effet (les flèches font défiler).
export function moveRowFocus(step: 1 | -1): boolean {
  const links = [...document.querySelectorAll<HTMLElement>(`${ROW} a`)];
  if (links.length === 0) return false;
  const row = aimedRow();
  const from = row ? links.findIndex((link) => row.contains(link)) : -1;
  const to = from === -1 ? 0 : Math.min(Math.max(from + step, 0), links.length - 1);
  links[to]?.focus();
  return true;
}

// Entrée ouvre la tâche survolée, sauf si un lien, un bouton ou un champ a le focus : Entrée est à lui.
export function openAimedRow(): boolean {
  const active = document.activeElement;
  if (active && active !== document.body && !active.matches('main')) return false;
  const link = aimedRow()?.querySelector('a');
  link?.click();
  return link != null;
}

// S, P, A, L, D : ouvre le sélecteur de la propriété, là où la page le montre. Les tâches cochées
// d'abord (la barre d'actions groupées), puis la tâche visée, puis la tâche ouverte.
export function openPicker(kind: PickerKind): void {
  const bulk = document.querySelector(BULK_BAR);
  const scope = bulk ?? aimedRow() ?? document.querySelector('[data-task-page]');
  if (!scope) return void toast('Visez d’abord une tâche : J ou K, ou survolez-la.');
  const trigger = scope.querySelector<HTMLElement>(`[data-picker="${kind}"]`);
  // La barre n'a pas de statut commun à des tâches de projets différents.
  if (!trigger && bulk) return void toast('Indisponible pour cette sélection.');
  // Une propriété que l'affichage masque n'a pas de déclencheur à ouvrir.
  if (!trigger || trigger.getClientRects().length === 0) {
    return void toast('Cette propriété n’est pas affichée. Ajoutez-la depuis Affichage.');
  }
  // Sur un bouton désactivé (action en cours, trop de tâches cochées), click() reste sans effet.
  trigger.click();
}
