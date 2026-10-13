import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TopBarProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  search?: ReactNode;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function TopBar({ organizationName, userName, userEmail, search }: TopBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b bg-background px-4">
      <Link href="/" className="font-semibold">
        Leon
      </Link>
      <span className="text-[13px] leading-[18px] text-muted-foreground">{organizationName}</span>
      <div className="mx-auto w-full max-w-xl flex-1">{search}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Menu du compte, ${userName}`}>
            <span className="font-mono text-xs">{initials(userName)}</span>
            <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
    </header>
  );
}
