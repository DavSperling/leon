'use client';

import { FileText, Quote, Search, SquareCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef, useState } from 'react';
import { searchAction, setThemeAction } from '@/app/(app)/actions';
import {
  ACTION_GROUPS,
  matchingActions,
  type PaletteAction,
  paletteActions,
  taskRefTarget,
} from '@/components/palette-actions';
import { SECTIONS } from '@/components/sidebar-sections';
import { KeyCaps } from '@/components/tasks/shortcut-hint';
import { useShortcutRegistry } from '@/components/tasks/use-task-shortcuts';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { taskHref } from '@/lib/tasks/task-links';
import type { SearchResult } from '@/server/memory/search';

const DEBOUNCE_MS = 200;

type Outcome = { query: string; results: SearchResult[] | 'error' };

type ActionGroupsProps = { actions: PaletteAction[]; onRun: (action: PaletteAction) => void };

// Les commandes que la saisie désigne, par groupe : créer une tâche, thème, vues enregistrées, aide.
function ActionGroups({ actions, onRun }: ActionGroupsProps) {
  return ACTION_GROUPS.map((group) => {
    const own = actions.filter((action) => action.group === group);
    return (
      own.length > 0 && (
        <CommandGroup key={group} heading={group}>
          {own.map((action) => (
            <CommandItem key={action.id} value={action.id} onSelect={() => onRun(action)}>
              <action.icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{action.label}</span>
              {action.key && (
                <CommandShortcut className="tracking-normal">
                  <KeyCaps id={action.key} />
                </CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )
    );
  });
}

type CommandSearchProps = { views?: readonly { id: string; name: string }[] };

// Recherche et navigation (⌘K). Entrée ouvre la fiche, ⌘Entrée l'ouvre sur l'onglet Brut. Sur les
// pages de tâches, la palette va aussi à une tâche (LEO-12), crée une tâche, change le thème et
// ouvre une vue enregistrée (`views`).
export function CommandSearch({ views = [] }: CommandSearchProps) {
  const router = useRouter();
  const shortcuts = useShortcutRegistry();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const withMod = useRef(false);
  const query = input.trim();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!query) return;
    let current = true;
    const timer = setTimeout(async () => {
      const results = await searchAction(query).catch(() => 'error' as const);
      if (current) setOutcome({ query, results });
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const runAction = ({ effect }: PaletteAction) => {
    if ('href' in effect) return go(effect.href);
    setOpen(false);
    if ('theme' in effect) startTransition(() => setThemeAction(effect.theme));
    else shortcuts?.run(effect.shortcut);
  };
  const openCard = (id: string) => {
    go(`/fiches/${id}${withMod.current ? '?onglet=brut' : ''}`);
    withMod.current = false;
  };

  // Les résultats de la requête précédente restent affichés jusqu'à l'arrivée des nouveaux.
  const settled = query !== '' && outcome?.query === query;
  const failed = settled && outcome.results === 'error';
  const found = query !== '' && Array.isArray(outcome?.results) ? outcome.results : [];
  const ref = taskRefTarget(query);
  const actions = matchingActions(
    paletteActions({
      views,
      canCreate: shortcuts?.has('create') ?? false,
      canHelp: shortcuts?.has('help') ?? false,
    }),
    query,
  );

  return (
    <>
      <Button
        variant="outline"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
        className="h-10 w-full justify-start rounded-xl bg-card text-[15px] font-normal text-muted-foreground shadow-xs transition-colors"
      >
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="font-mono text-xs leading-4">⌘K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche"
        description="Chercher une fiche, un fait ou une tâche, aller à une section ou lancer une commande."
      >
        <Command
          shouldFilter={false}
          onKeyDown={(event) => {
            withMod.current = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
          }}
        >
          <CommandInput
            value={input}
            onValueChange={setInput}
            maxLength={200}
            aria-label="Rechercher"
            placeholder="Rechercher, aller à LEO-12, lancer une commande…"
          />
          <CommandList>
            {failed && (
              <p role="alert" className="px-3 py-4 text-sm text-destructive">
                Recherche impossible. Réessayez.
              </p>
            )}
            {settled && !failed && found.length === 0 && actions.length === 0 && !ref && (
              <p role="status" className="px-3 py-4 text-sm">
                Aucun résultat pour “{query}”.
              </p>
            )}
            {ref && (
              <CommandGroup heading="Tâche">
                <CommandItem value={`tache-${ref}`} onSelect={() => go(taskHref(ref, ''))}>
                  <SquareCheck size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span className="truncate">Aller à {ref}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {found.length > 0 && (
              <CommandGroup heading="Fiches">
                {found.map((card) => (
                  <CommandItem
                    key={`fiche-${card.id}`}
                    value={`fiche-${card.id}`}
                    onSelect={() => openCard(card.id)}
                  >
                    <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span className="truncate">{card.title}</span>
                    <CommandShortcut className="tracking-normal">{card.typeLabel}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {found.some((card) => card.matchedFact) && (
              <CommandGroup heading="Faits">
                {found.map(
                  (card) =>
                    card.matchedFact && (
                      <CommandItem
                        key={`fait-${card.matchedFact.id}`}
                        value={`fait-${card.matchedFact.id}`}
                        onSelect={() => openCard(card.id)}
                      >
                        <Quote size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span className="truncate">{card.matchedFact.statement}</span>
                        <CommandShortcut className="tracking-normal">{card.title}</CommandShortcut>
                      </CommandItem>
                    ),
                )}
              </CommandGroup>
            )}
            {query === '' && (
              <CommandGroup heading="Aller à">
                {SECTIONS.map(({ href, label, icon: Icon }) => (
                  <CommandItem key={href} value={href} onSelect={() => go(href)}>
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <ActionGroups actions={actions} onRun={runAction} />
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
