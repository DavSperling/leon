import { ChevronsUpDown, LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from '@/components/ui/menu';
import { ME, ORG } from '@/data/people';
import { cn } from '@/lib/cn';
import { nb } from '@/lib/nb';
import { useTheme } from '@/lib/theme';
import { LABEL, railOnly, useRailCollapsed } from './rail';

// Repliée, la carte perd son cadre : il reste l'initiale (cible de 40 px), qui ouvre le même menu, à droite.
const FOLDED = 'group-data-[rail=replie]/rail:border-transparent group-data-[rail=replie]/rail:bg-transparent group-data-[rail=replie]/rail:shadow-none group-data-[rail=replie]/rail:hover:border-transparent group-data-[rail=replie]/rail:hover:bg-hover group-data-[rail=replie]/rail:data-[state=open]:bg-hover';

/** Haut de la barre latérale : l'espace et la personne ; derrière, le compte, le thème et la déconnexion. */
export function WorkspaceMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const collapsed = useRailCollapsed();
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <Tooltip content={`${ORG.name} · ${ME.name}`} side="right">
        <DropdownMenuTrigger
          onPointerMove={railOnly}
          onFocus={railOnly}
          aria-label={nb(`Menu du compte : ${ORG.name}, ${ME.name}`)}
          className={cn('flex h-10 w-full shrink-0 items-center gap-2.5 rounded-field border border-line bg-glass-2 pr-2.5 pl-[5px] text-left shadow-hi transition-[background-color,border-color,box-shadow] duration-200 hover:border-line-strong data-[state=open]:border-line-strong', FOLDED)}
        >
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11.5px] font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">{ORG.initial}</span>
          <span className={cn(LABEL, 'flex min-w-0 flex-1 items-center gap-2 overflow-hidden')}>
            {/* largeur plancher : pendant le repli, les noms sont coupés par le parent, sans « … » qui clignote */}
            <span className="min-w-[132px] flex-1">
              <span className="block truncate text-[13px] leading-tight font-semibold">{ORG.name}</span>
              <span className="block truncate text-[12px] leading-snug text-muted">{ME.name}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted" strokeWidth={1.6} />
          </span>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side={collapsed ? 'right' : 'bottom'} className="w-56">
        <DropdownMenuLabel className="grid gap-0.5 pb-2">
          <span className="text-ui font-semibold text-fg">{ORG.name}</span>
          <span className="truncate text-label font-normal text-muted">{ME.name} · {ME.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={theme === 'dark' ? Sun : Moon} onSelect={toggle}>
          {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
        </DropdownMenuItem>
        <DropdownMenuItem icon={LogOut} onSelect={() => navigate('/connexion')}>Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
