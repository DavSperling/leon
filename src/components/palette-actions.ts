import { Keyboard, type LucideIcon, Plus, SquareCheck, UserRound } from 'lucide-react';
import type { ShortcutId } from '@/components/tasks/shortcuts';
import { THEME_CHOICES } from '@/components/theme-choices';
import { fold } from '@/lib/fold';
import { formatTaskRef, parseTaskRef } from '@/lib/tasks/ref';
import { MY_TASKS_HREF, viewHref } from '@/lib/tasks/task-links';
import type { Theme } from '@/lib/theme-cookie';

// Ce que la palette (⌘K) propose en plus de la recherche : des commandes, rangées par groupe.
export const ACTION_GROUPS = ['Tâches', 'Thème', 'Vues enregistrées', 'Aide'] as const;

export type PaletteAction = {
  id: string;
  group: (typeof ACTION_GROUPS)[number];
  label: string;
  keywords?: string; // ce que l'on peut taper en plus du libellé
  icon: LucideIcon;
  key?: ShortcutId; // la touche à montrer en face
  effect: { href: string } | { theme: Theme } | { shortcut: ShortcutId };
};

type PaletteInput = {
  views: readonly { id: string; name: string }[]; // les vues enregistrées visibles
  canCreate: boolean; // la page a un dialogue de création à ouvrir
  hasShortcuts: boolean; // la page est sous ShortcutsProvider : G M et l'aide y répondent
};

const CREATE: PaletteAction = {
  id: 'create',
  group: 'Tâches',
  label: 'Créer une tâche',
  keywords: 'nouvelle',
  icon: Plus,
  key: 'create',
  effect: { shortcut: 'create' },
};

const HELP: PaletteAction = {
  id: 'help',
  group: 'Aide',
  label: 'Raccourcis clavier',
  keywords: 'aide touches',
  icon: Keyboard,
  key: 'help',
  effect: { shortcut: 'help' },
};

// La capsule G M n'a de sens que là où la touche répond.
const mineAction = (hasShortcuts: boolean): PaletteAction => ({
  id: 'mine',
  group: 'Tâches',
  label: 'Mes tâches',
  icon: UserRound,
  key: hasShortcuts ? 'go-mine' : undefined,
  effect: { href: MY_TASKS_HREF },
});

const THEMES = THEME_CHOICES.map(
  ({ value, label, Icon }): PaletteAction => ({
    id: `theme-${value}`,
    group: 'Thème',
    label: `Thème ${label.toLowerCase()}`,
    keywords: 'apparence',
    icon: Icon,
    effect: { theme: value },
  }),
);

const viewAction = ({ id, name }: PaletteInput['views'][number]): PaletteAction => ({
  id: `view-${id}`,
  group: 'Vues enregistrées',
  label: name,
  keywords: 'vue',
  icon: SquareCheck,
  effect: { href: viewHref(id) },
});

export function paletteActions({ views, canCreate, hasShortcuts }: PaletteInput): PaletteAction[] {
  return [
    ...(canCreate ? [CREATE] : []),
    mineAction(hasShortcuts),
    ...THEMES,
    ...views.map(viewAction),
    ...(hasShortcuts ? [HELP] : []),
  ];
}

// Les commandes que la saisie désigne, sans tenir compte des accents ni de la casse.
export function matchingActions(actions: PaletteAction[], query: string): PaletteAction[] {
  const needle = fold(query.trim());
  if (needle === '') return actions;
  return actions.filter(({ label, keywords = '' }) =>
    fold(`${label} ${keywords}`).includes(needle),
  );
}

// « leo-12 » → « LEO-12 » ; null quand la saisie n'est pas un identifiant de tâche.
export function taskRefTarget(query: string): string | null {
  const parsed = parseTaskRef(query.trim());
  return parsed && formatTaskRef(parsed.key, parsed.number);
}
