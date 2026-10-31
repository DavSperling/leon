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

// En-tête du site public : la marque, la navigation (Cas d'usage ouvre un méga-menu des équipes), le thème, puis
// « Se connecter » et « Créer un espace ». Verre transparent en haut de page, qui se densifie dès qu'on défile.
// Sous 960 px : la marque, « Créer un espace » et un bouton Menu qui ouvre la feuille du bas.

/** « page » sur la page même, « true » sur la section qui la contient (« Cas d’usage » sur /cas-usage/ventes). */
const currentOf = (pathname: string, href: string): 'page' | 'true' | undefined =>
  pathname === href ? 'page' : pathname.startsWith(`${href}/`) ? 'true' : undefined;

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const LINK =
  'relative inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-ui font-medium whitespace-nowrap text-fg-2 transition-colors duration-200 hover:bg-hover hover:text-fg aria-[current=page]:text-fg aria-[current=true]:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg';

function ActiveDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent transition-opacity duration-300',
        on ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

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
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-200 hover:bg-hover hover:text-fg',
        className,
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.7} className="size-[17px]" />
    </button>
  );
}

function TeamsMenu({ pathname }: { pathname: string }) {
  const t = useTranslations('site.header');
  const { teams } = useSiteContent();
  return (
    <NavigationMenu.Content className="site-menu-content absolute top-[calc(100%+10px)] left-1/2 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 rounded-box border border-line-strong bg-menu p-2.5 shadow-float">
      <div className="grid grid-cols-2 gap-1">
        {teams.map((team) => (
          <NavigationMenu.Link key={team.slug} asChild>
            <Link
              href={`/cas-usage/${team.slug}`}
              aria-current={pathname === `/cas-usage/${team.slug}` ? 'page' : undefined}
              className="group flex gap-3 rounded-field p-3 transition-colors duration-200 hover:bg-hover focus-visible:bg-hover"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-item border border-line bg-glass-3 text-accent transition-colors duration-200 group-hover:border-accent-line group-hover:bg-accent-soft">
                <team.icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-ui font-semibold text-fg">{team.label}</span>
                <span className="mt-0.5 block text-label leading-[1.45] text-muted">
                  {nb(team.pitch)}
                </span>
              </span>
            </Link>
          </NavigationMenu.Link>
        ))}
      </div>
      <NavigationMenu.Link asChild>
        <Link
          href="/cas-usage"
          className="group mt-1.5 flex items-center justify-between rounded-field border border-line bg-glass-3 px-3.5 py-2.5 text-label font-semibold text-fg-2 transition-colors duration-200 hover:border-accent-line hover:text-fg"
        >
          {t('allUseCases')}
          <ArrowRight
            aria-hidden="true"
            strokeWidth={2}
            className="size-3.5 text-accent transition-transform duration-300 group-hover:translate-x-0.5"
          />
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
        <button
          type="button"
          aria-label={t('menu')}
          className="inline-grid size-10 place-items-center rounded-full border border-line bg-glass-3 text-fg-2 transition-colors hover:text-fg"
        >
          <Menu aria-hidden="true" strokeWidth={1.8} className="size-[18px]" />
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
        <SheetClose
          aria-label={t('close')}
          className="absolute top-2 right-2 grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <X aria-hidden="true" strokeWidth={1.8} className="size-[18px]" />
        </SheetClose>
        <nav aria-label={t('nav')} className="mt-5 grid gap-1">
          {navLinks.map((l, i) => (
            <SheetClose key={l.href} asChild>
              <Link
                ref={i === 0 ? first : undefined}
                href={l.href}
                aria-current={currentOf(pathname, l.href)}
                className="flex h-12 items-center justify-between rounded-field px-3 text-[16px] font-semibold text-fg-2 hover:bg-hover aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent"
              >
                {l.label}
                <ArrowRight aria-hidden="true" strokeWidth={1.8} className="size-4 text-muted" />
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-1.5 border-t border-line pt-3">
          {teams.map((team) => (
            <SheetClose key={team.slug} asChild>
              <Link
                href={`/cas-usage/${team.slug}`}
                aria-current={pathname === `/cas-usage/${team.slug}` ? 'page' : undefined}
                className="flex min-h-11 items-center gap-2.5 rounded-field border border-line bg-glass-3 px-3 text-label font-semibold text-fg-2"
              >
                <team.icon aria-hidden="true" strokeWidth={1.7} className="size-4 text-accent" />
                {team.label}
              </Link>
            </SheetClose>
          ))}
        </div>
        <div className="grid gap-2 border-t border-line pt-3">
          <SheetClose asChild>
            <Link
              href="/inscription"
              className="site-cta inline-flex h-12 items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-ink"
            >
              {cta('create')}
            </Link>
          </SheetClose>
          <div className="flex items-center gap-2">
            <SheetClose asChild>
              <Link
                href="/connexion"
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-line-strong bg-glass-3 text-[15px] font-semibold text-fg"
              >
                {cta('signIn')}
              </Link>
            </SheetClose>
            <ThemeButton className="size-12 border border-line-strong bg-glass-3" />
          </div>
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
  const onSignUp = pathname === '/inscription';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="site-header fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5"
    >
      {/* progression de la lecture, en CSS (animation-timeline: scroll()) */}
      <span aria-hidden="true" className="site-progress" />
      <div className="site-header-bar mx-auto flex h-[58px] max-w-[1200px] items-center gap-2 rounded-full border border-transparent pr-2 pl-3 sm:pl-4">
        <Link
          href="/accueil"
          aria-label={t('home')}
          className="flex h-10 shrink-0 items-center rounded-full pr-2"
        >
          <Brand className="h-6" />
        </Link>

        <NavigationMenu.Root
          aria-label={t('nav')}
          delayDuration={80}
          className="relative mx-auto max-[960px]:hidden"
        >
          <NavigationMenu.List className="flex items-center gap-0.5">
            {navLinks.map((l) =>
              l.href === '/cas-usage' ? (
                <NavigationMenu.Item key={l.href}>
                  <NavigationMenu.Trigger
                    className={LINK}
                    aria-current={currentOf(pathname, l.href)}
                  >
                    {l.label}
                    <ChevronDown
                      aria-hidden="true"
                      strokeWidth={1.8}
                      className="size-3.5 text-muted transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                    />
                    <ActiveDot on={isActive(pathname, l.href)} />
                  </NavigationMenu.Trigger>
                  <TeamsMenu pathname={pathname} />
                </NavigationMenu.Item>
              ) : (
                <NavigationMenu.Item key={l.href}>
                  <NavigationMenu.Link asChild active={isActive(pathname, l.href)}>
                    <Link href={l.href} className={LINK} aria-current={currentOf(pathname, l.href)}>
                      {l.label}
                      <ActiveDot on={isActive(pathname, l.href)} />
                    </Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
              ),
            )}
          </NavigationMenu.List>
        </NavigationMenu.Root>

        <div className="flex items-center gap-1.5 max-[960px]:ml-auto">
          <ThemeButton className="max-[960px]:hidden" />
          {/* sur /inscription, les deux boutons s'échangent : le principal ne mène jamais à la page courante */}
          <Link
            href={onSignUp ? '/inscription' : '/connexion'}
            aria-current={onSignUp || pathname === '/connexion' ? 'page' : undefined}
            className="inline-flex h-10 items-center rounded-full px-4 text-ui font-semibold whitespace-nowrap text-fg-2 transition-colors duration-200 hover:bg-hover hover:text-fg aria-[current=page]:text-fg max-[960px]:hidden"
          >
            {onSignUp ? cta('create') : cta('signIn')}
          </Link>
          <Link
            href={onSignUp ? '/connexion' : '/inscription'}
            className="site-cta inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-ui font-semibold whitespace-nowrap text-accent-ink transition-[filter,scale] duration-200 hover:brightness-[1.06] active:scale-[.97] max-[420px]:px-3.5"
          >
            {onSignUp ? cta('signIn') : cta('create')}
          </Link>
          <div className="min-[960px]:hidden">
            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
    </header>
  );
}
