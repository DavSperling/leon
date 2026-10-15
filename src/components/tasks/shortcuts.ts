// Les raccourcis clavier des tâches : une seule table, que lisent l'écouteur de touches, l'aide (?),
// les infobulles et le test d'absence de conflit. Les touches se comparent par `event.key` (jamais
// `event.code`) : sur un clavier AZERTY, « J » est bien la touche qui produit « j ».

export type ShortcutId =
  | 'palette'
  | 'help'
  | 'rail'
  | 'escape'
  | 'go-tasks'
  | 'go-mine'
  | 'next'
  | 'previous'
  | 'open'
  | 'create'
  | 'select'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'due'
  | 'filter';

export type ShortcutGroup = 'general' | 'navigation' | 'task';

export const GROUP_LABELS: Record<ShortcutGroup, string> = {
  general: 'Général',
  navigation: 'Navigation',
  task: 'Tâches',
};

// `key` est la valeur de `event.key` (lettres en minuscules). `mod` : ⌘, ou Ctrl hors Mac. `after` :
// la touche qui doit la précéder (« G puis T »).
export type Binding = { key: string; mod?: true; after?: string };

export type Shortcut = {
  id: ShortcutId;
  group: ShortcutGroup;
  label: string;
  bindings: readonly Binding[];
  repeat?: true; // une touche maintenue répète l'action
  elsewhere?: true; // lue ailleurs (⌘K, ⌘B, Échap) : l'écouteur des tâches ne la traite pas
};

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'palette',
    group: 'general',
    label: 'Ouvrir la palette de commandes',
    bindings: [{ key: 'k', mod: true }],
    elsewhere: true,
  },
  { id: 'help', group: 'general', label: 'Afficher les raccourcis', bindings: [{ key: '?' }] },
  {
    id: 'rail',
    group: 'general',
    label: 'Replier la barre latérale',
    bindings: [{ key: 'b', mod: true }],
    elsewhere: true,
  },
  {
    id: 'escape',
    group: 'general',
    label: 'Fermer, ou revenir à la liste',
    bindings: [{ key: 'Escape' }],
    elsewhere: true,
  },
  {
    id: 'go-tasks',
    group: 'navigation',
    label: 'Aller aux tâches',
    bindings: [{ key: 't', after: 'g' }],
  },
  {
    id: 'go-mine',
    group: 'navigation',
    label: 'Aller à mes tâches',
    bindings: [{ key: 'm', after: 'g' }],
  },
  {
    id: 'next',
    group: 'navigation',
    label: 'Tâche suivante',
    bindings: [{ key: 'j' }, { key: 'ArrowDown' }],
    repeat: true,
  },
  {
    id: 'previous',
    group: 'navigation',
    label: 'Tâche précédente',
    bindings: [{ key: 'k' }, { key: 'ArrowUp' }],
    repeat: true,
  },
  { id: 'open', group: 'navigation', label: 'Ouvrir la tâche', bindings: [{ key: 'Enter' }] },
  { id: 'create', group: 'task', label: 'Nouvelle tâche', bindings: [{ key: 'c' }] },
  {
    id: 'select',
    group: 'task',
    label: 'Ajouter ou retirer de la sélection',
    bindings: [{ key: 'x' }],
  },
  { id: 'status', group: 'task', label: 'Changer le statut', bindings: [{ key: 's' }] },
  { id: 'priority', group: 'task', label: 'Changer la priorité', bindings: [{ key: 'p' }] },
  { id: 'assignee', group: 'task', label: 'Changer l’assigné', bindings: [{ key: 'a' }] },
  { id: 'labels', group: 'task', label: 'Changer les étiquettes', bindings: [{ key: 'l' }] },
  { id: 'due', group: 'task', label: 'Changer l’échéance', bindings: [{ key: 'd' }] },
  { id: 'filter', group: 'task', label: 'Ajouter un filtre', bindings: [{ key: 'f' }] },
];

export function shortcutOf(id: ShortcutId): Shortcut {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!shortcut) throw new Error(`Raccourci inconnu : ${id}`);
  return shortcut;
}

const KEY_NAMES: Record<string, string> = {
  ArrowDown: '↓',
  ArrowUp: '↑',
  Enter: '↵',
  Escape: 'Échap',
};

// Les touches à afficher, une capsule chacune : ['G', 'T'] pour « G puis T », ['⌘K'] pour ⌘K.
export function bindingKeys({ key, mod, after }: Binding): string[] {
  const name = KEY_NAMES[key] ?? key.toUpperCase();
  if (mod) return [`⌘${name}`];
  return after ? [after.toUpperCase(), name] : [name];
}

// Pour aria-keyshortcuts, qui nomme les touches comme `event.key` : « S », « Escape », « G T »,
// « Meta+K Control+K ».
export function ariaKeys(id: ShortcutId): string | undefined {
  const [first] = shortcutOf(id).bindings;
  if (!first) return undefined;
  const key = first.key.length === 1 ? first.key.toUpperCase() : first.key;
  if (first.mod) return `Meta+${key} Control+${key}`;
  return first.after ? `${first.after.toUpperCase()} ${key}` : key;
}

export type KeyInput = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat'
>;

export type KeyState = {
  busy: boolean; // un champ, un éditeur, un menu ou un dialogue a la main : la touche est à lui
  after: string | null; // la touche d'une séquence déjà pressée (« g »)
};

export type Resolution = { run: ShortcutId } | { prefix: string } | null;

// Les touches qui ouvrent une séquence (« g »).
const PREFIXES = new Set(
  SHORTCUTS.flatMap(({ bindings }) => bindings.flatMap(({ after }) => (after ? [after] : []))),
);

// Maj fait partie de la frappe d'un symbole (« ? »), pas d'une lettre : Maj+C n'est pas C.
const isSymbol = (key: string): boolean => key.length === 1 && !/\p{L}/u.test(key);

// Quelle action une frappe déclenche, ou si elle ouvre une séquence. Rien dans un champ ni sous un
// dialogue, rien avec Alt, et les lettres seules ne répondent ni à ⌘ ni à Ctrl (⌘C copie).
export function resolveKey(event: KeyInput, { busy, after }: KeyState): Resolution {
  if (busy || event.altKey || (event.shiftKey && !isSymbol(event.key))) return null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const found = SHORTCUTS.find(
    (shortcut) =>
      !shortcut.elsewhere &&
      shortcut.bindings.some(
        (binding) =>
          binding.key === key && Boolean(binding.mod) === mod && (binding.after ?? null) === after,
      ),
  );
  if (found) return event.repeat && !found.repeat ? null : { run: found.id };
  return after === null && !mod && !event.repeat && PREFIXES.has(key) ? { prefix: key } : null;
}
