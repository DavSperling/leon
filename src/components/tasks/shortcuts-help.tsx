'use client';

import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BindingCaps } from './shortcut-hint';
import { GROUP_LABELS, SHORTCUTS, type ShortcutGroup } from './shortcuts';

const GROUPS = Object.keys(GROUP_LABELS) as ShortcutGroup[];

type ShortcutsHelpProps = { open: boolean; onOpenChange: (open: boolean) => void };

// L'aide (?) : toutes les touches de la table, par groupe.
export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Les touches seules n’agissent pas quand vous écrivez dans un champ.
          </DialogDescription>
        </DialogHeader>
        <div className="sm:columns-2 sm:gap-10">
          {GROUPS.map((group) => (
            <section
              key={group}
              aria-label={GROUP_LABELS[group]}
              className="mb-5 break-inside-avoid"
            >
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {GROUP_LABELS[group]}
              </h3>
              <dl>
                {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex min-h-8 items-center justify-between gap-4"
                  >
                    <dt className="text-sm">{shortcut.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1.5">
                      {shortcut.bindings.map((binding, index) => (
                        <Fragment key={`${binding.after ?? ''}${binding.key}`}>
                          {index > 0 && <span className="text-xs text-muted-foreground">ou</span>}
                          <BindingCaps binding={binding} />
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
