'use client';

import { type ChainedCommands, type Editor, Extension } from '@tiptap/core';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  TextQuote,
} from 'lucide-react';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Command, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { fold } from '@/lib/fold';

export type SlashItem = {
  id: string;
  label: string;
  shortcut: string; // le raccourci Markdown du même bloc, affiché pour qu'on l'apprenne
  icon: LucideIcon;
  apply: (chain: ChainedCommands) => ChainedCommands;
};

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'h1',
    label: 'Titre 1',
    shortcut: '#',
    icon: Heading1,
    apply: (c) => c.toggleHeading({ level: 1 }),
  },
  {
    id: 'h2',
    label: 'Titre 2',
    shortcut: '##',
    icon: Heading2,
    apply: (c) => c.toggleHeading({ level: 2 }),
  },
  {
    id: 'h3',
    label: 'Titre 3',
    shortcut: '###',
    icon: Heading3,
    apply: (c) => c.toggleHeading({ level: 3 }),
  },
  { id: 'bullets', label: 'Liste', shortcut: '-', icon: List, apply: (c) => c.toggleBulletList() },
  {
    id: 'numbers',
    label: 'Liste numérotée',
    shortcut: '1.',
    icon: ListOrdered,
    apply: (c) => c.toggleOrderedList(),
  },
  {
    id: 'tasks',
    label: 'Cases à cocher',
    shortcut: '[]',
    icon: ListChecks,
    apply: (c) => c.toggleTaskList(),
  },
  {
    id: 'code',
    label: 'Bloc de code',
    shortcut: '```',
    icon: Code,
    apply: (c) => c.toggleCodeBlock(),
  },
  {
    id: 'quote',
    label: 'Citation',
    shortcut: '>',
    icon: TextQuote,
    apply: (c) => c.toggleBlockquote(),
  },
  {
    id: 'rule',
    label: 'Séparateur',
    shortcut: '---',
    icon: Minus,
    apply: (c) => c.setHorizontalRule(),
  },
];

// Ce qui suit « / » filtre les blocs par leur libellé, sans tenir compte des accents.
export function filterSlashItems(query: string): SlashItem[] {
  const needle = fold(query.trim());
  return SLASH_ITEMS.filter((item) => fold(item.label).includes(needle));
}

type Menu = {
  items: SlashItem[];
  selected: number;
  pick: (item: SlashItem) => void;
  anchor: { current: { getBoundingClientRect: () => DOMRect } }; // le curseur, relu à chaque mesure
};

type Show = (menu: Menu | null) => void;

function toMenu(props: SuggestionProps<SlashItem, SlashItem>): Menu | null {
  if (props.items.length === 0) return null;
  const { clientRect } = props;
  return {
    items: props.items,
    selected: 0,
    pick: props.command,
    anchor: { current: { getBoundingClientRect: () => clientRect?.() ?? new DOMRect() } },
  };
}

// Les flèches changent le bloc choisi, Entrée l'insère ; le reste va à l'éditeur.
function handleKey(menu: Menu | null, event: KeyboardEvent, show: Show): boolean {
  if (!menu) return false;
  const last = menu.items.length - 1;
  if (event.key === 'ArrowDown') {
    show({ ...menu, selected: menu.selected === last ? 0 : menu.selected + 1 });
  } else if (event.key === 'ArrowUp') {
    show({ ...menu, selected: menu.selected === 0 ? last : menu.selected - 1 });
  } else if (event.key === 'Enter') {
    const item = menu.items[menu.selected];
    if (item) menu.pick(item);
  } else {
    return false;
  }
  return true;
}

function createSlashExtension(live: RefObject<Menu | null>, show: Show) {
  return Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) =>
            props.apply(editor.chain().focus().deleteRange(range)).run(),
          // Dans un bloc de code, « / » est du code.
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          render: () => ({
            onStart: (props) => show(toMenu(props)),
            onUpdate: (props) => show(toMenu(props)),
            onExit: () => show(null),
            onKeyDown: ({ event }) => handleKey(live.current, event, show),
          }),
        }),
      ];
    },
  });
}

// Le menu « / » : l'extension à donner à l'éditeur, et le menu à afficher à côté.
export function useSlashMenu() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const live = useRef<Menu | null>(null);
  const show = useCallback<Show>((next) => {
    live.current = next;
    setMenu(next);
  }, []);
  const [extension] = useState(() => createSlashExtension(live, show));
  const hover = (id: string) => {
    const index = live.current?.items.findIndex((item) => item.id === id) ?? -1;
    if (live.current && index >= 0) show({ ...live.current, selected: index });
  };
  return { extension, menu, hover };
}

type SlashMenuProps = {
  menu: Menu | null;
  editor: Editor | null;
  onHover: (id: string) => void;
};

// Le focus reste dans l'éditeur : la souris n'y touche pas (onMouseDown), le clavier passe par
// l'extension. Un clic ailleurs ou Échap ferme le menu et fait sortir l'extension de sa saisie.
export function SlashMenu({ menu, editor, onHover }: SlashMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  const current = menu?.items[menu.selected];
  const currentId = current?.id;
  useEffect(() => {
    list.current
      ?.querySelector(`[data-value="${currentId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);
  if (!menu || !current) return null;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open && editor) exitSuggestion(editor.view);
      }}
    >
      <PopoverAnchor virtualRef={menu.anchor} />
      <PopoverContent
        align="start"
        aria-label="Insérer un bloc"
        className="w-60 gap-0 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false} label="Blocs" value={current.id} onValueChange={onHover}>
          <CommandList ref={list}>
            {menu.items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => menu.pick(item)}
                className="gap-2 [&>svg:last-child]:hidden"
              >
                <item.icon size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <CommandShortcut className="ml-0 font-mono">{item.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <span role="status" className="sr-only">
          {current.label}, {menu.selected + 1} sur {menu.items.length}
        </span>
      </PopoverContent>
    </Popover>
  );
}
