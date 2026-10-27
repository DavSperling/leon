import {
  Building2,
  Database,
  FileKey,
  Globe,
  KeyRound,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { useSiteContent } from '../content';
import { Tilt } from '../fx';
import { CtaBand, CtaLink, Kicker, SectionHeading } from '../parts';
import { PageHero, PageSection } from './page-hero';
import './pages.css';

// Page « Sécurité » : ce qui est vrai dans le code (SECURITY_FACTS), qui voit quoi, et ce qui n'est pas encore là
// (NOT_YET). Aucune certification, région d'hébergement ni conformité n'est affirmée : rien de tout ça n'est établi.

// Une icône par fait, dans l'ordre de SECURITY_FACTS (pas de cadenas ni d'œil : brand.md).
const FACT_ICONS: LucideIcon[] = [
  Building2,
  ShieldCheck,
  NotebookPen,
  KeyRound,
  FileKey,
  Globe,
  ScrollText,
  Database,
];

// Les deux listes de « Qui voit quoi » (site.security.teamSees et onlyYou).
const TEAM_SEES = ['read', 'support', 'link'] as const;
const ONLY_YOU = ['ai', 'discussions', 'notes', 'outlook'] as const;

/**
 * Le chemin d'une question, en trois plans de verre empilés en perspective (pages.css, .pg-iso) : la question en haut,
 * le filtre des droits au milieu, le classement en bas. Les plans s'écartent au survol et en entrant dans l'écran.
 */
function RightsVisual() {
  const t = useTranslations('site.security');
  const sample = useTranslations('site.sample');
  const common = useTranslations('site.common');
  const plane =
    'absolute inset-0 rounded-[22px] border p-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,.55),inset_0_1px_0_var(--hi)]';
  return (
    <figure className="relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pg-iso relative grid min-h-[400px] place-items-center sm:min-h-[500px]"
      >
        <div className="site-halo pointer-events-none absolute inset-0 opacity-80 [mask:radial-gradient(closest-side,#000,transparent)]" />
        <div className="pg-iso-stage relative h-[200px] w-[270px] sm:h-[250px] sm:w-[370px]">
          <div className="pg-iso-plane" style={{ '--z': 0 } as CSSProperties}>
            <div
              className={cn(
                plane,
                // plans du bas : le contenu sur la bande que le plan du dessus laisse voir
                'flex flex-col justify-end',
                'border-line-strong bg-[color-mix(in_srgb,var(--menu)_62%,transparent)]',
              )}
            >
              <p className="font-mono text-[11px] tracking-normal text-muted">{t('ranking')}</p>
              <div className="mt-3 grid gap-2">
                {(['meeting', 'quote', 'migration'] as const).map((key, k) => (
                  <p
                    key={key}
                    className="flex items-center gap-2 rounded-[10px] border border-line bg-glass-3 px-2.5 py-1.5 text-label text-fg-2"
                  >
                    <span className="font-mono text-[10.5px] text-accent">[{k + 1}]</span>
                    {nb(sample(key))}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="pg-iso-plane" style={{ '--z': 1 } as CSSProperties}>
            <div
              className={cn(
                plane,
                // plans du bas : le contenu sur la bande que le plan du dessus laisse voir
                'flex flex-col justify-end',
                'signal-line border-accent-line bg-[color-mix(in_srgb,var(--menu)_58%,var(--accent-soft))]',
              )}
            >
              <p className="flex items-center gap-2 font-mono text-[11px] tracking-normal text-accent">
                <ShieldCheck strokeWidth={1.8} className="size-3.5" />
                {t('filter')}
              </p>
              <div className="mt-3 grid gap-1.5 text-label">
                <p className="flex items-center gap-2 text-fg-2">
                  <span className="size-2 rounded-full bg-success" />
                  {t('teamPages')}
                </p>
                <p className="flex items-center gap-2 text-fg-2">
                  <span className="size-2 rounded-full bg-success" />
                  {t('ownConversations')}
                </p>
                <p className="flex items-center gap-2 text-muted line-through decoration-line-strong">
                  <span className="size-2 rounded-full bg-line-strong" />
                  {t('colleague')}
                </p>
              </div>
            </div>
          </div>
          <div className="pg-iso-plane" style={{ '--z': 2 } as CSSProperties}>
            <div
              className={cn(
                plane,
                'border-line-strong bg-[color-mix(in_srgb,var(--menu)_70%,transparent)]',
              )}
            >
              <p className="font-mono text-[11px] tracking-normal text-muted">{t('question')}</p>
              <div className="mt-3 flex h-11 items-center gap-2.5 rounded-[12px] border border-line-strong bg-glass-2 px-3">
                <span className="font-mono text-[11px] text-muted">/</span>
                <span className="text-ui font-medium text-fg">{nb(t('query'))}</span>
                <span className="caret" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="-mt-14 text-center font-mono text-meta tracking-normal text-muted sm:-mt-20">
        <span className="sr-only">{nb(t('visualCaption'))}</span>
        {common('fictional')}
      </figcaption>
    </figure>
  );
}

export function SecuritePage() {
  const t = useTranslations('site.security');
  const cta = useTranslations('site.cta');
  const common = useTranslations('site.common');
  const { securityFacts, notYet } = useSiteContent();
  return (
    <>
      <PageHero
        kicker={common('security')}
        title={t('heroTitle')}
        accent={t('heroAccent')}
        lead={t('heroLead')}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="#pas-encore" variant="secondary">
              {t('notYet')}
            </CtaLink>
          </>
        }
        aside={<RightsVisual />}
      />

      <PageSection labelledBy="faits-titre" className="pt-6 sm:pt-10">
        <SectionHeading
          id="faits-titre"
          kicker={t('factsKicker')}
          title={t('factsTitle')}
          lead={t('factsLead')}
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {securityFacts.map((f, i) => {
            const Icon = FACT_ICONS[i] ?? ShieldCheck;
            return (
              <li key={f.title} className="site-reveal">
                <Tilt
                  max={9}
                  className="h-full rounded-box border border-line bg-panel p-5 shadow-hi transition-[border-color] duration-300 hover:border-accent-line"
                >
                  <span className="fx-pop grid size-10 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent [--pop:40px]">
                    <Icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
                  </span>
                  <h3 className="mt-5 text-ui font-bold tracking-[-0.01em] text-fg">
                    {nb(f.title)}
                  </h3>
                  <p className="mt-2 text-label leading-[1.6] text-fg-2">{nb(f.text)}</p>
                </Tilt>
              </li>
            );
          })}
        </ul>
      </PageSection>

      <PageSection labelledBy="qui-titre">
        <SectionHeading
          id="qui-titre"
          kicker={t('whoKicker')}
          title={t('whoTitle')}
          align="center"
        />
        <div className="mx-auto mt-10 grid max-w-[980px] gap-4 md:grid-cols-2">
          <section
            aria-labelledby="equipe-voit"
            className="site-reveal rounded-panel border border-line bg-panel p-6 shadow-hi sm:p-8"
          >
            <span className="grid size-11 place-items-center rounded-full border border-success-line bg-success-soft text-success shadow-[0_0_0_8px_var(--success-soft)]">
              <Users aria-hidden="true" strokeWidth={1.7} className="size-5" />
            </span>
            <h3 id="equipe-voit" className="mt-5 text-h2 font-bold tracking-[-0.02em] text-fg">
              {t('teamTitle')}
            </h3>
            <p className="mt-2 text-body text-fg-2">{nb(t('teamText'))}</p>
            <ul className="mt-5 grid gap-2.5">
              {TEAM_SEES.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-ui text-fg-2">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-success"
                  />
                  {nb(t(`teamSees.${k}`))}
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-labelledby="vous-voyez"
            className="site-reveal signal-line signal-glow relative overflow-hidden rounded-panel border border-accent-line bg-panel p-6 shadow-hi sm:p-8"
          >
            <span className="fx-breathe relative grid size-11 place-items-center rounded-full border border-accent-line bg-accent-soft text-accent shadow-[0_0_0_8px_var(--accent-soft)]">
              <UserRound aria-hidden="true" strokeWidth={1.7} className="size-5" />
            </span>
            <h3
              id="vous-voyez"
              className="relative mt-5 text-h2 font-bold tracking-[-0.02em] text-fg"
            >
              {t('youTitle')}
            </h3>
            <p className="relative mt-2 text-body text-fg-2">{nb(t('youText'))}</p>
            <ul className="relative mt-5 grid gap-2.5">
              {ONLY_YOU.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-ui text-fg-2">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {nb(t(`onlyYou.${k}`))}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageSection>

      <PageSection id="pas-encore" labelledBy="pas-encore-titre">
        <div className="site-reveal relative overflow-hidden rounded-panel border border-warning-line bg-warning-soft p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
            <div>
              <Kicker className="text-warning [&>span]:bg-warning">{t('frankly')}</Kicker>
              <h2
                id="pas-encore-titre"
                className="mt-3 text-[clamp(26px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.035em] text-balance text-fg"
              >
                {nb(t('notYetTitle'))}
              </h2>
              <p className="mt-4 text-body leading-[1.6] text-fg-2">{nb(t('notYetLead'))}</p>
            </div>
            <ol className="grid content-start gap-3">
              {notYet.map((n, i) => (
                <li
                  key={n}
                  className="site-reveal flex items-start gap-4 rounded-box border border-line bg-panel px-4 py-3.5 shadow-hi transition-[translate,border-color] duration-300 ease-out hover:translate-x-1 hover:border-warning-line"
                >
                  <span className="mt-0.5 font-mono text-meta tracking-normal text-warning">
                    0{i + 1}
                  </span>
                  <span className="text-ui leading-[1.55] text-fg">{nb(n)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </PageSection>

      <CtaBand title={t('ctaTitle')} text={t('ctaText')} />
    </>
  );
}
