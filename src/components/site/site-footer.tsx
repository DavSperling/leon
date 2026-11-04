import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { Brand } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { useSiteContent } from './content';
import { MotionSwitch } from './motion-switch';
import { Container } from './parts';

// Chaque langue écrite dans sa langue (et marquée lang=) : « Français » se lit en français, même sur le site anglais.
const LANGUAGES = [
  { locale: 'en', label: 'English' },
  { locale: 'fr', label: 'Français' },
] as const;

/** Le choix de la langue : un formulaire qui pose le cookie leon-locale, sans session et sans JavaScript. */
function LanguageSwitch() {
  const t = useTranslations('site.footer');
  const current = useLocale();
  return (
    <form action={setLocaleAction} aria-label={t('language')} className="flex items-center gap-1">
      {LANGUAGES.map((l) => (
        <button
          key={l.locale}
          type="submit"
          name="locale"
          value={l.locale}
          lang={l.locale}
          aria-current={l.locale === current ? 'true' : undefined}
          className="inline-flex items-center rounded-sm px-1.5 text-muted underline-offset-4 transition-colors duration-200 hover:text-fg aria-[current=true]:text-fg aria-[current=true]:underline pointer-coarse:min-h-10"
        >
          {l.label}
        </button>
      ))}
    </form>
  );
}

/** La dernière ligne du pied : la langue et l'arrêt des animations. Seule sur les pages de connexion. */
export function SiteFooterBar({ className }: { className?: string }) {
  const { taglines } = useSiteContent();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 font-mono text-meta tracking-normal text-muted',
        className,
      )}
    >
      <span>© 2026 Leon</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LanguageSwitch />
        <MotionSwitch />
      </div>
      <span>{nb(taglines.source)}</span>
    </div>
  );
}

/** Pied du site : la promesse, quatre colonnes de liens, le grand mot « Leon » en filigrane. */
export function SiteFooter() {
  const t = useTranslations('site.footer');
  const common = useTranslations('site.common');
  const cta = useTranslations('site.cta');
  const security = useTranslations('site.security');
  const { teams, taglines } = useSiteContent();
  const columns = [
    {
      title: t('product'),
      links: [
        { href: '/produit', label: cta('howItWorks') },
        { href: '/produit#retrouve', label: t('search') },
        { href: '/produit#discute', label: t('discussions') },
        { href: '/connecteurs', label: common('connectors') },
        { href: '/tarifs', label: t('pricing') },
        { href: '/documentation', label: t('documentation') },
      ],
    },
    {
      title: common('useCases'),
      links: teams.map((team) => ({ href: `/cas-usage/${team.slug}`, label: team.label })),
    },
    {
      title: t('trust'),
      links: [
        { href: '/securite', label: common('security') },
        { href: '/securite#pas-encore', label: security('notYet') },
      ],
    },
    {
      title: t('account'),
      links: [
        { href: '/connexion', label: cta('signIn') },
        { href: '/inscription', label: cta('create') },
      ],
    },
  ];
  return (
    <footer className="relative mt-10 overflow-hidden border-t border-line">
      <Container className="relative pt-16 pb-10">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div className="max-w-[340px]">
            <Link href="/accueil" className="inline-flex min-h-10 items-center rounded-full">
              <Brand className="h-6" />
            </Link>
            <p className="mt-4 text-body leading-[1.6] text-fg-2">{nb(taglines.pitch)}</p>
          </div>
          <nav aria-label={t('nav')} className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title}>
                <h2 className="font-mono text-meta font-medium tracking-[0.08em] text-muted uppercase">
                  {col.title}
                </h2>
                <ul className="mt-4 grid gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-flex items-center rounded-sm text-ui text-fg-2 transition-colors duration-200 hover:text-fg pointer-coarse:min-h-10"
                      >
                        {nb(l.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <SiteFooterBar className="mt-14 border-t border-line pt-6" />
      </Container>
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.22em] text-center text-[clamp(120px,26vw,360px)] leading-[0.8] font-extrabold tracking-[-0.06em] text-transparent select-none [-webkit-text-stroke:1px_var(--line-strong)] [mask:linear-gradient(180deg,#000_10%,transparent_95%)]"
      >
        Leon
      </p>
    </footer>
  );
}
