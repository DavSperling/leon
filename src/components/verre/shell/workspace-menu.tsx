'use client';

import { ChevronsUpDown, LogOut, Moon, Sun } from 'lucide-react';
import { startTransition } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/verre/ui/menu';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { useTheme } from '@/lib/verre/theme';
import { initialOf } from './brand';
import { LABEL, railOnly, useRailCollapsed } from './rail';

/** La personne connectée et son organisation (getViewerProfile). */
export type Viewer = { organizationName: string; userName: string; userEmail: string };

// Repliée, la carte perd son cadre : il reste l'initiale (cible de 40 px), qui ouvre le même menu, à droite.
const FOLDED =
  'group-data-[rail=replie]/rail:border-transparent group-data-[rail=replie]/rail:bg-transparent group-data-[rail=replie]/rail:shadow-none group-data-[rail=replie]/rail:hover:border-transparent group-data-[rail=replie]/rail:hover:bg-hover group-data-[rail=replie]/rail:data-[state=open]:bg-hover';

/** Haut de la barre latérale : l'espace et la personne ; derrière, le compte, le thème et la déconnexion. */
export function WorkspaceMenu({ organizationName, userName, userEmail }: Viewer) {
  const { theme, toggle } = useTheme();
  const collapsed = useRailCollapsed();
  return (
    <DropdownMenu>
      <Tooltip content={`${organizationName} · ${userName}`} side="right">
        <DropdownMenuTrigger
          onPointerMove={railOnly}
          onFocus={railOnly}
          aria-label={nb(`Menu du compte : ${organizationName}, ${userName}`)}
          className={cn(
            'flex h-10 w-full shrink-0 items-center gap-2.5 rounded-field border border-line bg-glass-2 pr-2.5 pl-[5px] text-left shadow-hi transition-[background-color,border-color,box-shadow] duration-200 hover:border-line-strong data-[state=open]:border-line-strong',
            FOLDED,
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11.5px] font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]"
          >
            {initialOf(organizationName)}
          </span>
          <span className={cn(LABEL, 'flex min-w-0 flex-1 items-center gap-2 overflow-hidden')}>
            {/* largeur plancher : pendant le repli, les noms sont coupés par le parent, sans « … » qui clignote */}
            <span className="min-w-[132px] flex-1">
              <span className="block truncate text-[13px] leading-tight font-semibold">
                {organizationName}
              </span>
              <span className="block truncate text-[12px] leading-snug text-muted">{userName}</span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
              strokeWidth={1.6}
            />
          </span>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side={collapsed ? 'right' : 'bottom'} className="w-56">
        <DropdownMenuLabel className="grid gap-0.5 pb-2">
          <span className="text-ui font-semibold text-fg">{organizationName}</span>
          <span className="truncate text-label font-normal text-muted">
            {userName} · {userEmail}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={theme === 'dark' ? Sun : Moon} onSelect={toggle}>
          {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
        </DropdownMenuItem>
        <DropdownMenuItem icon={LogOut} onSelect={() => startTransition(signOutAction)}>
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
