import { Blocks, Globe, KeyRound, ListChecks, Plug, Terminal, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { ALL_TOOLS, TOOL_COUNT } from '../content';
import { LogoSphere, Tilt } from '../fx';
import { CtaBand, CtaLink, Kicker, SectionHeading } from '../parts';
import { ConnecteursCatalogue } from './connecteurs-catalogue';
import { PageHero, PageSection, PlannedBadge } from './page-hero';

// Page « Connecteurs » : le catalogue filtrable des outils, comment on branche, les conversations d'IA, ce qui est
// prévu. Les deux sites d'assistants que capte l'extension ne sont pas nommés (marketing.md, publicité comparative).

/** La sphère des outils, à faire tourner, posée sur un socle de verre. */
function SphereStage() {
  const t = useTranslations('site.connectors');
  const common = useTranslations('site.common');
  return (
    <figure className="relative mx-auto w-full max-w-[540px]">
      <div
        aria-hidden="true"
        className="absolute inset-[6%] rounded-full border border-line bg-[radial-gradient(closest-side,var(--glass-2),transparent)] shadow-[inset_0_1px_0_var(--hi)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[18%] rounded-full border border-dashed border-accent-line opacity-60"
      />
      <LogoSphere tools={ALL_TOOLS} size={46} srList={false} />
      <figcaption className="mt-2 text-center font-mono text-meta tracking-normal text-muted">
        {nb(common('toolCount', { count: TOOL_COUNT }))}
        <span aria-hidden="true">{nb(t('spin'))}</span>
      </figcaption>
    </figure>
  );
}

// Les textes sont dans site.connectors (messages) : ici, l'icône de chaque étape et de chaque canal.
const STEPS = [
  { icon: Plug, key: 'pick' },
  { icon: KeyRound, key: 'auth' },
  { icon: Timer, key: 'period' },
  { icon: ListChecks, key: 'test' },
] as const;

const CHANNELS = [
  { icon: Globe, key: 'extension' },
  { icon: Terminal, key: 'coding' },
  { icon: Blocks, key: 'mcp' },
] as const;

const PLANNED = ['google', 'microsoft', 'files'] as const;

export function ConnecteursPage() {
  const t = useTranslations('site.connectors');
  const cta = useTranslations('site.cta');
  const common = useTranslations('site.common');
  return (
    <>
      <PageHero
        kicker={common('connectors')}
        title={t('heroTitle', { count: TOOL_COUNT })}
        lead={t('heroLead')}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="#catalogue" variant="secondary">
              {t('browse')}
            </CtaLink>
          </>
        }
        accent={t('heroAccent')}
        aside={<SphereStage />}
      />

      <PageSection id="catalogue" labelledBy="catalogue-titre" className="pt-6 sm:pt-10">
        <SectionHeading
          id="catalogue-titre"
          kicker={t('catalogKicker')}
          title={t('catalogTitle')}
          lead={t('catalogLead')}
        />
        <ConnecteursCatalogue />
        <p className="mt-6 max-w-[720px] text-label text-pretty leading-[1.6] text-muted">
          {nb(t('betaNote'))}
        </p>
      </PageSection>

      <PageSection labelledBy="brancher-titre">
        <SectionHeading
          id="brancher-titre"
          kicker={t('connectKicker')}
          title={t('connectTitle')}
          lead={t('connectLead')}
        />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.key} className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-5 shadow-hi">
                {/* preserve-3d jusqu'à la pastille, et pas d'overflow sur la carte : sinon sa 3D est aplatie */}
                <div className="flex items-center justify-between [transform-style:preserve-3d]">
                  <span className="fx-pop grid size-10 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
                    <s.icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
                  </span>
                  <span className="font-mono text-meta tracking-normal text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-title font-bold tracking-[-0.02em] text-fg">
                  {nb(t(`steps.${s.key}.title`))}
                </h3>
                <p className="mt-2 text-body leading-[1.6] text-fg-2">
                  {nb(t(`steps.${s.key}.text`))}
                </p>
              </Tilt>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection labelledBy="ia-titre">
        <SectionHeading
          id="ia-titre"
          kicker={t('aiKicker')}
          title={t('aiTitle')}
          lead={t('aiLead')}
        />
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {CHANNELS.map((c, i) => (
            <li key={c.key} className="site-reveal">
              <Tilt
                className={cn(
                  'h-full rounded-box border bg-panel p-6 shadow-hi',
                  i === 0 ? 'signal-glow fx-ring border-accent-line' : 'border-line',
                )}
              >
                {/* le filet Signal sur un calque rogné à part : un overflow sur la carte aplatirait sa 3D */}
                {i === 0 && (
                  <span
                    aria-hidden="true"
                    className="signal-line pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  />
                )}
                <span className="fx-pop relative grid size-11 place-items-center rounded-item border border-line bg-glass-3 text-accent">
                  <c.icon aria-hidden="true" strokeWidth={1.7} className="size-5" />
                </span>
                <h3 className="relative mt-5 text-title font-bold tracking-[-0.02em] text-fg">
                  {t(`channels.${c.key}.title`)}
                </h3>
                <p className="relative mt-2 text-body leading-[1.6] text-fg-2">
                  {nb(t(`channels.${c.key}.text`))}
                </p>
                <ul className="relative mt-5 grid gap-2 border-t border-line pt-4">
                  {(['p1', 'p2', 'p3'] as const).map((p) => (
                    <li key={p} className="flex items-center gap-2 text-label text-fg-2">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {nb(t(`channels.${c.key}.${p}`))}
                    </li>
                  ))}
                </ul>
              </Tilt>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection labelledBy="prevu-titre" className="pt-4 sm:pt-8">
        <div className="site-reveal grid items-center gap-8 rounded-panel border border-dashed border-line-strong bg-glass-3 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <Kicker>{common('next')}</Kicker>
            <h2
              id="prevu-titre"
              className="mt-3 text-[clamp(24px,2.8vw,34px)] leading-[1.1] font-bold tracking-[-0.03em] text-fg"
            >
              {t('plannedTitle')}
            </h2>
            <p className="mt-3 text-body leading-[1.6] text-fg-2">{nb(t('plannedLead'))}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {PLANNED.map((p) => (
              <li key={p} className="rounded-card border border-line bg-panel p-4 shadow-hi">
                <PlannedBadge />
                <p className="mt-3 text-ui font-semibold text-fg">{t(`planned.${p}.title`)}</p>
                <p className="mt-1 text-label text-muted">{t(`planned.${p}.text`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </PageSection>

      <CtaBand title={t('ctaTitle')} text={t('ctaText')} />
    </>
  );
}
