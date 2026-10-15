'use client';

import { ChevronsUpDown } from 'lucide-react';
import { startTransition } from 'react';
import { setThemeAction, signOutAction } from '@/app/(app)/actions';
import { THEME_CHOICES } from '@/components/theme-choices';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Theme } from '@/lib/theme-cookie';

type WorkspaceMenuProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  theme: Theme;
};

// Haut de la barre latérale : l'organisation, et le menu du compte derrière (thème, déconnexion).
export function WorkspaceMenu({
  organizationName,
  userName,
  userEmail,
  theme,
}: WorkspaceMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu du compte, ${userName}`}
        className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-xs transition-colors hover:bg-accent"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-semibold"
        >
          {organizationName.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base leading-5 font-medium">{organizationName}</span>
          <span className="block truncate text-sm leading-5 text-muted-foreground">{userName}</span>
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
        <DropdownMenuLabel>Thème</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-label="Thème"
          value={theme}
          onValueChange={(value) => startTransition(() => setThemeAction(value))}
        >
          {THEME_CHOICES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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
