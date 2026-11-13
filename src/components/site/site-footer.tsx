import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { Brand } from '@/components/verre/shell/brand';
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
    <form action={setLocaleAction} aria-label={t('language')} className="flex items-center gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l.locale}
          type="submit"
          name="locale"
          value={l.locale}
          lang={l.locale}
          aria-current={l.locale === current ? 'true' : undefined}
        >
          {l.label}
        </button>
      ))}
    </form>
  );
}

/** Le pied du site : une bande d'encre, la marque, quatre colonnes de liens ; dessous, la langue et l'arrêt des
 *  animations. */
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
    <footer className="s-ink s-foot">
      <Container className="s-grid s-foot__grid">
        <div className="col-[1/13] lg:col-[1/5]">
          <Link href="/accueil" className="s-brand inline-flex min-h-11 items-center">
            <Brand className="h-9" />
          </Link>
          {/* la promesse, sous la marque, signée des trois traits (elle était perdue dans la ligne du bas) */}
          <p className="s-foot__line">
            <span aria-hidden="true" className="strokes">
              <i />
              <i />
              <i />
            </span>
            {nb(taglines.source)}
          </p>
        </div>
        <nav
          aria-label={t('nav')}
          className="col-[1/13] grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:col-[5/13]"
        >
          {columns.map((col) => (
            <div key={col.title}>
              <h2>{col.title}</h2>
              <ul className="mt-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{nb(l.label)}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="s-foot__base">
          <span>© 2026 Leon</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <LanguageSwitch />
            <MotionSwitch />
          </div>
        </div>
      </Container>
    </footer>
  );
}
