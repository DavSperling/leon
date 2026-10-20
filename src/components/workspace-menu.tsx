import { ChevronsUpDown } from 'lucide-react';
import { signOutAction } from '@/app/(app)/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type WorkspaceMenuProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
};

// Haut de la barre latérale : l'organisation, et le menu du compte derrière.
export function WorkspaceMenu({ organizationName, userName, userEmail }: WorkspaceMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu du compte, ${userName}`}
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card text-[13px] font-medium ring-1 ring-border"
        >
          {organizationName.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[14px] leading-5 font-medium" title={organizationName}>
            {organizationName}
          </span>
          <span className="block truncate text-[12px] leading-4 text-muted-foreground">
            {userName}
          </span>
        </span>
        <ChevronsUpDown
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{userName}</span>
          <span className="block text-[13px] leading-[18px] font-normal text-muted-foreground">
            {userEmail}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              Se déconnecter
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
