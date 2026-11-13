'use client';

import { ArrowRight, ChevronDown, Menu, Moon, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NavigationMenu } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '@/components/verre/shell/brand';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/verre/ui/dialog';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { useTheme } from '@/lib/verre/theme';
import { useSiteContent } from './content';

// En-tête du site public : la marque (ses trois traits se tracent une fois au chargement), la navigation (« Cas
// d'usage » ouvre les six équipes), le thème ; puis, à part après un filet, « Créer un espace » et « Se connecter ».
// Une barre blanche fixe ; un filet dessous dès qu'on défile. Sous 1200 px, les liens passent dans le menu ; sous 960,
// le thème et « Se connecter » aussi : la marque, « Créer un espace », le menu.

/** « page » sur la page même, « true » sur la section qui la contient (« Cas d’usage » sur /cas-usage/ventes). */
const currentOf = (pathname: string, href: string): 'page' | 'true' | undefined =>
  pathname === href ? 'page' : pathname.startsWith(`${href}/`) ? 'true' : undefined;

function ThemeButton({ className }: { className?: string }) {
  const t = useTranslations('site.header');
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? t('lightTheme') : t('darkTheme');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn('s-icon-btn', className)}
    >
      <Icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
    </button>
  );
}

function TeamsMenu({ pathname }: { pathname: string }) {
  const t = useTranslations('site.header');
  const { teams } = useSiteContent();
  return (
    <NavigationMenu.Content className="s-menu">
      <ul className="grid grid-cols-2 gap-0.5">
        {teams.map((team) => (
          <li key={team.slug}>
            <NavigationMenu.Link asChild>
              <Link
                href={`/cas-usage/${team.slug}`}
                aria-current={pathname === `/cas-usage/${team.slug}` ? 'page' : undefined}
              >
                <span className="block text-ui font-medium text-fg">{team.label}</span>
                <span className="mt-0.5 block text-label text-muted">{nb(team.pitch)}</span>
              </Link>
            </NavigationMenu.Link>
          </li>
        ))}
      </ul>
      <NavigationMenu.Link asChild>
        <Link
          href="/cas-usage"
          className="mt-1 flex items-center justify-between border-t border-line text-ui font-medium"
        >
          {t('allUseCases')}
          <ArrowRight aria-hidden="true" strokeWidth={1.8} className="size-4" />
        </Link>
      </NavigationMenu.Link>
    </NavigationMenu.Content>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const t = useTranslations('site.header');
  const cta = useTranslations('site.cta');
  const { navLinks, teams } = useSiteContent();
  const first = useRef<HTMLAnchorElement>(null);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" aria-label={t('menu')} className="s-icon-btn size-11 text-fg">
          <Menu aria-hidden="true" strokeWidth={1.8} className="size-[22px]" />
        </button>
      </SheetTrigger>
      <SheetContent
        title={t('menu')}
        titleHidden
        hideClose
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          first.current?.focus();
        }}
      >
        <SheetClose aria-label={t('close')} className="s-icon-btn absolute top-2 right-2 size-11">
          <X aria-hidden="true" strokeWidth={1.8} className="size-[20px]" />
        </SheetClose>
        <nav aria-label={t('nav')} className="mt-6 grid">
          {navLinks.map((l, i) => (
            <SheetClose key={l.href} asChild>
              <Link
                ref={i === 0 ? first : undefined}
                href={l.href}
                aria-current={currentOf(pathname, l.href)}
                className="flex min-h-12 items-center border-b border-line text-[17px] font-medium text-fg aria-[current]:underline aria-[current]:underline-offset-4"
              >
                {l.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <ul className="grid grid-cols-2 gap-x-4">
          {teams.map((team) => (
            <li key={team.slug}>
              <SheetClose asChild>
                <Link
                  href={`/cas-usage/${team.slug}`}
                  aria-current={pathname === `/cas-usage/${team.slug}` ? 'page' : undefined}
                  className="flex min-h-11 items-center text-ui text-muted aria-[current]:text-fg"
                >
                  {team.label}
                </Link>
              </SheetClose>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-line pt-4">
          <SheetClose asChild>
            <Link href="/inscription" className="s-btn s-btn--ink flex-1">
              {cta('create')}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href="/connexion" className="s-btn s-btn--line flex-1">
              {cta('signIn')}
            </Link>
          </SheetClose>
          <ThemeButton className="size-12" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  const t = useTranslations('site.header');
  const cta = useTranslations('site.cta');
  const { navLinks } = useSiteContent();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header data-scrolled={scrolled || undefined} className="s-nav">
      <div className="s-wrap s-nav__in">
        <Link
          href="/accueil"
          aria-label={t('home')}
          className="s-brand flex h-11 shrink-0 items-center"
        >
          <Brand className="h-[22px]" />
        </Link>

        <NavigationMenu.Root aria-label={t('nav')} delayDuration={80} className="s-nav__links">
          <NavigationMenu.List>
            {navLinks.map((l) => (
              <NavigationMenu.Item key={l.href} className="relative">
                {l.href === '/cas-usage' ? (
                  <>
                    <NavigationMenu.Trigger
                      className="s-nav__link"
                      aria-current={currentOf(pathname, l.href)}
                    >
                      {l.label}
                      <ChevronDown
                        aria-hidden="true"
                        strokeWidth={1.8}
                        className="size-3.5 text-icon transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                      />
                    </NavigationMenu.Trigger>
                    <TeamsMenu pathname={pathname} />
                  </>
                ) : (
                  <NavigationMenu.Link asChild active={currentOf(pathname, l.href) !== undefined}>
                    <Link
                      href={l.href}
                      className="s-nav__link"
                      aria-current={currentOf(pathname, l.href)}
                    >
                      {l.label}
                    </Link>
                  </NavigationMenu.Link>
                )}
              </NavigationMenu.Item>
            ))}
          </NavigationMenu.List>
        </NavigationMenu.Root>

        <div className="s-nav__account">
          <ThemeButton className="s-nav__wide" />
          <Link href="/inscription" className="s-btn s-btn--ink s-btn--sm">
            {cta('create')}
          </Link>
          <Link href="/connexion" className="s-btn s-btn--line s-btn--sm s-nav__wide">
            {cta('signIn')}
          </Link>
          <div className="min-[1200px]:hidden">
            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
      {/* le fil de lecture : les trois traits de la marque s'allongent avec la page (CSS seul, site.css) */}
      <span aria-hidden="true" className="s-nav__read">
        <i />
        <i />
        <i />
      </span>
    </header>
  );
}
