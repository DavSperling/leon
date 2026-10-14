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
        className="flex w-full items-center gap-3 rounded-xl border bg-card px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-accent"
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
        >
          {organizationName.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-5 font-medium">
            {organizationName}
          </span>
          <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">
            {userName}
          </span>
        </span>
        <ChevronsUpDown
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-muted-foreground"
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
