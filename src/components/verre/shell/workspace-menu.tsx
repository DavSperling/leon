'use client';

import { ChevronsUpDown, LogOut, Moon, Settings2, ShieldCheck, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { Avatar } from '@/components/verre/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/verre/ui/menu';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { useTheme } from '@/lib/verre/theme';
import { LABEL, railOnly, useRailCollapsed } from './rail';

/** La personne connectée et son espace (getViewerProfile), sa photo si le compte en a une, et si elle administre Leon. */
export type Viewer = {
  organizationName: string;
  userName: string;
  userEmail: string;
  userImage?: string | null;
  admin?: boolean;
};

/** Qui est connecté : son rond, son nom et une ligne discrète (l'espace dans la barre, l'adresse dans le menu). */
export function Identity({
  name,
  image,
  caption,
  className,
}: {
  name: string;
  image?: string | null;
  caption: string;
  className?: string;
}) {
  return (
    <>
      <Avatar name={name} src={image} size={32} />
      <span className={cn('grid min-w-0 flex-1 leading-[1.3]', className)}>
        <b className="truncate text-ui font-semibold text-fg">{name}</b>
        <span className="truncate text-label text-muted">{caption}</span>
      </span>
    </>
  );
}

/**
 * Pied de la barre latérale : une seule ligne d'identité (le rond de la personne, son nom, le nom de l'espace), qui
 * ouvre son menu : Réglages, le thème, Admin (pour un admin de Leon seulement), Se déconnecter. Repliée, il reste le
 * rond, discret, avec un anneau d'encre au survol et au clavier.
 */
export function AccountMenu({ organizationName, userName, userEmail, userImage, admin }: Viewer) {
  const t = useTranslations('shell');
  const navT = useTranslations('navigation');
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const collapsed = useRailCollapsed();
  return (
    <DropdownMenu>
      <Tooltip content={userName} side="right">
        <DropdownMenuTrigger
          onPointerMove={railOnly}
          onFocus={railOnly}
          aria-label={nb(t('accountMenu', { organization: organizationName, user: userName }))}
          // ouvert : aria-expanded (le data-state de l'élément est celui de l'infobulle, qui l'enveloppe)
          className={cn(
            'flex w-full shrink-0 items-center gap-2.5 rounded-b-item border-t border-line p-2 text-left transition-[background-color,box-shadow] duration-150 hover:bg-hover aria-expanded:bg-hover',
            'group-data-[rail=replie]/rail:mt-2 group-data-[rail=replie]/rail:w-auto group-data-[rail=replie]/rail:self-center group-data-[rail=replie]/rail:rounded-full group-data-[rail=replie]/rail:border-0 group-data-[rail=replie]/rail:p-0 group-data-[rail=replie]/rail:hover:bg-transparent group-data-[rail=replie]/rail:hover:shadow-[0_0_0_2px_var(--glass),0_0_0_4px_var(--text)] group-data-[rail=replie]/rail:aria-expanded:bg-transparent group-data-[rail=replie]/rail:aria-expanded:shadow-[0_0_0_2px_var(--glass),0_0_0_4px_var(--text)]',
          )}
        >
          <Identity
            name={userName}
            image={userImage}
            caption={organizationName}
            className={cn(LABEL, 'group-data-[rail=replie]/rail:hidden')}
          />
          <ChevronsUpDown
            aria-hidden="true"
            strokeWidth={1.6}
            className={cn(LABEL, 'size-4 shrink-0 text-icon group-data-[rail=replie]/rail:hidden')}
          />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        // dépliée, le menu a la largeur de la ligne qui l'ouvre : il reste dans la barre ; repliée, il s'ouvre à côté
        className={collapsed ? 'w-[248px]' : 'w-[var(--radix-dropdown-menu-trigger-width)]'}
      >
        {/* le nom entier de l'espace se lit ici (la ligne de la barre le coupe) ; l'adresse, discrète, dessous */}
        <div className="mb-1.5 flex items-start gap-2.5 border-b border-line px-2 pt-2 pb-3">
          <Avatar name={userName} src={userImage} size={32} />
          <span className="grid min-w-0 flex-1 leading-[1.3]">
            <b className="truncate text-ui font-semibold text-fg">{userName}</b>
            <span className="text-label break-words text-fg">{organizationName}</span>
            <span title={userEmail} className="truncate text-label text-muted">
              {userEmail}
            </span>
          </span>
        </div>
        <DropdownMenuItem icon={Settings2} onSelect={() => router.push('/reglages')}>
          {navT('settings')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={theme === 'dark' ? Sun : Moon} onSelect={toggle}>
          {theme === 'dark' ? t('lightTheme') : t('darkTheme')}
        </DropdownMenuItem>
        {admin && (
          <DropdownMenuItem icon={ShieldCheck} onSelect={() => router.push('/admin')}>
            {t('admin')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={LogOut} onSelect={() => startTransition(signOutAction)}>
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
