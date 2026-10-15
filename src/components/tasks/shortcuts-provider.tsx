'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ALL_TASKS_HREF, MY_TASKS_HREF } from '@/lib/tasks/task-links';
import { resolveKey } from './shortcuts';
import { ShortcutsHelp } from './shortcuts-help';
import { isTypingOrBusy } from './typing';
import { createRegistry, ShortcutsContext } from './use-task-shortcuts';

// Après « G », T et M ont une seconde pour suivre.
const SEQUENCE_MS = 1000;

// Les pages de tâches ont un seul écouteur de touches. Il cherche l'action dans la table
// (shortcuts.ts), puis la confie au composant qui s'est inscrit pour elle (useTaskShortcuts). Les
// touches de navigation et l'aide (?) valent sur toutes ces pages ; la fenêtre d'aide vit ici.
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [registry] = useState(createRegistry);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(
    () =>
      registry.register({
        help: () => setHelpOpen(true),
        'go-tasks': () => router.push(ALL_TASKS_HREF),
        'go-mine': () => router.push(MY_TASKS_HREF),
      }),
    [registry, router],
  );

  useEffect(() => {
    let after: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const resolved = resolveKey(event, { busy: isTypingOrBusy(), after });
      clearTimeout(timer);
      after = null;
      if (resolved && 'prefix' in resolved) {
        after = resolved.prefix;
        timer = setTimeout(() => {
          after = null;
        }, SEQUENCE_MS);
      } else if (resolved && registry.run(resolved.run)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, [registry]);

  return (
    <ShortcutsContext value={registry}>
      {children}
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </ShortcutsContext>
  );
}
