import { Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type SiteContent, TOOL_COUNT, useSiteContent } from '../content';
import { Tilt } from '../fx';
import { CtaBand, SectionHeading } from '../parts';
import { PageHero, PageSection } from './page-hero';
import './pages.css';

// Page « Tarifs » : la proposition de docs/etudes/founder-pme-2026-10/pricing.md (pas encore arrêtée, aucune
// facturation codée) : chaque bouton mène à la création d'un espace. Pas de « le plus choisi » : rien ne le mesure.

// Ce que chaque plan contient (site.pricing.everywhere).
const EVERYWHERE = [
  'connectors',
  'search',
  'answer',
  'discussions',
  'briefing',
  'capture',
  'secrets',
  'keys',
] as const;

// Les formules sont dans le premier écran : elles entrent avec le haut de page (site-rise, à la suite de PageHero),
// pas au défilement, qui les laisserait à moitié transparentes tant qu'on ne défile pas.
function PlanCard({ plan, i }: { plan: SiteContent['plans'][number]; i: number }) {
  const t = useTranslations('site.pricing');
  return (
    <li
      className={cn('site-rise relative', plan.featured && 'z-[1]')}
      style={{ '--i': 5 + i } as CSSProperties}
    >
      <div className={cn('h-full', plan.featured && 'pg-featured')}>
        <Tilt
          max={plan.featured ? 6 : 8}
          className={cn(
            'flex h-full flex-col rounded-panel border p-6 shadow-hi sm:p-7',
            plan.featured
              ? 'signal-glow fx-ring border-accent-line bg-glass-2 shadow-panel lg:py-10'
              : 'border-line bg-panel',
          )}
        >
          {/* le filet Signal sur un calque rogné à part : un overflow sur la carte aplatirait sa 3D (le prix) */}
          {plan.featured && (
            <span
              aria-hidden="true"
              className="signal-line pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
            />
          )}
          <div className="relative flex items-center justify-between gap-3">
            <h3 className="text-title font-bold tracking-[-0.02em] text-fg">{plan.name}</h3>
            {plan.featured && (
              <span className="inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2.5 font-mono text-[11px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                {t('recommended')}
              </span>
            )}
          </div>
          <p className="relative mt-2 text-body text-fg-2 lg:min-h-[3lh]">{nb(plan.text)}</p>
          <p className="fx-pop relative mt-7 flex items-baseline gap-2 [--pop:46px]">
            <span
              className={cn(
                'text-[44px] leading-none font-extrabold tracking-[-0.045em]',
                plan.featured ? 'site-gradient' : 'text-fg',
              )}
            >
              {nb(plan.price)}
            </span>
          </p>
          <p className="relative mt-2 font-mono text-meta tracking-normal text-muted">
            {nb(plan.unit)}
          </p>
          <Link
            href="/inscription"
            className={cn(
              'relative mt-7 inline-flex h-11 items-center justify-center rounded-full text-ui font-semibold transition-[background-color,border-color,filter,scale] duration-200 active:scale-[.97]',
              plan.featured
                ? 'site-cta bg-accent text-accent-ink hover:brightness-[1.06]'
                : 'border border-line-strong bg-glass-3 text-fg hover:border-accent-line hover:bg-hover',
            )}
          >
            {plan.cta}
          </Link>
          <ul className="relative mt-7 grid gap-3 border-t border-line pt-6">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-ui text-fg-2">
                <Check
                  aria-hidden="true"
                  strokeWidth={2.2}
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    plan.featured ? 'text-accent' : 'text-success',
                  )}
                />
                {nb(f)}
              </li>
            ))}
          </ul>
        </Tilt>
      </div>
    </li>
  );
}

export function TarifsPage() {
  const t = useTranslations('site.pricing');
  const cta = useTranslations('site.cta');
  const meta = useTranslations('site.meta');
  const { plans, faq } = useSiteContent();
  return (
    <>
      <PageHero
        kicker={meta('pricingTitle')}
        title={t('heroTitle')}
        accent={t('heroAccent')}
        lead={t('heroLead')}
        align="center"
        className="pb-10 sm:pb-12"
      />

      <PageSection labelledBy="plans-titre" className="pt-2 sm:pt-4">
        <h2 id="plans-titre" className="sr-only">
          {t('plans')}
        </h2>
        <ul className="mx-auto grid max-w-[1080px] items-stretch gap-4 lg:grid-cols-3">
          {plans.map((p, i) => (
            <PlanCard key={p.id} plan={p} i={i} />
          ))}
        </ul>
        <p className="mt-8 text-center font-mono text-meta tracking-normal text-muted">
          {nb(t('taxNote'))}
        </p>
      </PageSection>

      <PageSection labelledBy="partout-titre">
        <div className="site-reveal relative overflow-hidden rounded-panel border border-line bg-panel p-6 shadow-hi sm:p-10">
          <div
            aria-hidden="true"
            className="site-dots pointer-events-none absolute inset-0 opacity-60"
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
            <SectionHeading
              id="partout-titre"
              kicker={t('everywhereKicker')}
              title={t('everywhereTitle')}
              lead={t('everywhereLead')}
            />
            <ul className="grid content-center gap-x-6 gap-y-3 sm:grid-cols-2">
              {EVERYWHERE.map((e) => (
                <li key={e} className="flex items-start gap-2.5 text-ui text-fg-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                    <Check aria-hidden="true" strokeWidth={2.4} className="size-3" />
                  </span>
                  {nb(t(`everywhere.${e}`, { count: TOOL_COUNT }))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageSection>

      <PageSection labelledBy="faq-titre">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
          <SectionHeading
            id="faq-titre"
            kicker={t('faqKicker')}
            title={t('faqTitle')}
            lead={t('faqLead')}
          />
          <div className="grid content-start gap-2.5">
            {faq.map((f) => (
              <details
                key={f.q}
                className="pg-faq site-reveal group rounded-box border border-line bg-panel shadow-hi transition-[border-color,background-color,box-shadow] duration-300 open:border-accent-line open:bg-glass-2 open:shadow-panel"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 rounded-box px-5 py-3 text-ui font-semibold text-fg marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{nb(f.q)}</span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-glass-3 text-accent transition-[rotate,background-color,color] duration-300 ease-[var(--ease-spring)] group-open:rotate-45 group-open:bg-accent group-open:text-accent-ink">
                    <Plus aria-hidden="true" strokeWidth={2} className="size-3.5" />
                  </span>
                </summary>
                <p className="pg-faq-answer px-5 pb-5 text-body leading-[1.65] text-fg-2">
                  {nb(f.a)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </PageSection>

      <CtaBand
        title={t('ctaTitle')}
        text={t('ctaText', { count: TOOL_COUNT })}
        primary={{ href: '/inscription', label: cta('startPilot') }}
      />
    </>
  );
}
