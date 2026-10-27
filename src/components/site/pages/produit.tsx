import { Check, MessagesSquare, Plug, Sunrise, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Pillar, TOOL_COUNT, useSiteContent } from '../content';
import { DemoAnswerCard, DemoSearchField } from '../demo-card';
import { Layers3D, Tilt } from '../fx';
import {
  CitedAnswer,
  CtaBand,
  CtaLink,
  Kicker,
  LeonMark,
  QueryCode,
  SectionHeading,
  ToolLogo,
} from '../parts';
import { PageHero, PageSection, PlannedBadge } from './page-hero';
import './pages.css';

// Page « Produit » : les quatre étapes (capter, garder, retrouver, discuter), chacune avec un visuel fait en HTML et
// CSS d'après les vrais écrans, puis ce qui est prévu. Exemples fictifs, fonctions réelles (état de main).

const PANEL =
  'relative overflow-hidden rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-4 shadow-panel backdrop-blur-[30px] sm:p-5';
const CARD = 'rounded-box border border-line bg-glass-2 shadow-hi';

const CAPTURED: ProviderId[] = [
  'notion',
  'linear',
  'hubspot',
  'granola',
  'github',
  'intercom',
  'asana',
  'outlook',
];

/** Mention visible sous chaque visuel aux données inventées. */
const FICTIF = 'mt-3 px-1 font-mono text-meta tracking-normal text-muted';

/**
 * Un visuel illustratif : lu comme une image (légende pour les lecteurs d'écran), décor pour le reste. Il s'incline
 * vers le pointeur ; `chip`, une pastille qui flotte devant lui, sort du plan en 3D. Sous lui, la mention
 * « Exemple fictif · `label` », visible de tous.
 */
function Visual({
  caption,
  label,
  chip,
  tilt = true,
  children,
}: {
  caption: string;
  label: string;
  chip?: ReactNode;
  tilt?: boolean;
  children: ReactNode;
}) {
  const common = useTranslations('site.common');
  const body = (
    <>
      {children}
      {chip && (
        <div className="fx-pop pointer-events-none absolute -top-4 right-4 z-[4] [--pop:60px] sm:-right-3">
          <div className="site-float rounded-full border border-accent-line bg-[color-mix(in_srgb,var(--menu)_86%,transparent)] px-3.5 py-2 font-mono text-meta tracking-normal text-accent shadow-float backdrop-blur-[16px]">
            {chip}
          </div>
        </div>
      )}
    </>
  );
  return (
    <figure className="site-reveal relative min-w-0">
      <div aria-hidden="true">
        {tilt ? (
          <Tilt max={5} scale={1.01} perspective={1400} className="rounded-panel">
            {body}
          </Tilt>
        ) : (
          body
        )}
      </div>
      <figcaption className={FICTIF}>
        <span className="sr-only">{nb(`${caption} `)}</span>
        {nb(common('fictionalLabel', { label }))}
      </figcaption>
    </figure>
  );
}

/** Interrupteur figé (illustration de l'extension). */
function FakeSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors',
        on ? 'border-accent bg-accent' : 'border-line-strong bg-glass-3',
      )}
    >
      <span
        className={cn(
          'absolute size-4 rounded-full shadow-[0_1px_3px_rgba(0,0,0,.3)]',
          on ? 'left-[18px] bg-accent-ink' : 'left-[2px] bg-[var(--thumb)]',
        )}
      />
    </span>
  );
}

function CaptureVisual() {
  const t = useTranslations('site.product');
  return (
    <Visual caption={t('captureCaption')} label={t('captureLabel')} chip={t('captureChip')}>
      <div className={PANEL}>
        <div className="site-dots pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative grid gap-3">
          <div className={cn(CARD, 'p-4')}>
            <div className="flex items-center gap-2">
              <Plug strokeWidth={1.7} className="size-4 text-accent" />
              <span className="text-ui font-semibold text-fg">{t('connected')}</span>
              <span className="ml-auto flex items-center gap-1.5 font-mono text-meta tracking-normal text-muted">
                <span className="pulse" />
                {t('syncs')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-8">
              {CAPTURED.map((id, i) => (
                <span
                  key={id}
                  className="site-float grid place-items-center"
                  style={{ animationDelay: `${-i * 0.9}s` } as CSSProperties}
                >
                  <ToolLogo id={id} size={40} />
                </span>
              ))}
            </div>
            <p className="mt-3.5 font-mono text-meta tracking-normal text-muted">
              {t('connectable', { count: TOOL_COUNT })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className={cn(CARD, 'p-4')}>
              <p className="text-ui font-semibold text-fg">{t('extension')}</p>
              <p className="mt-1 text-label text-muted">{t('extensionChoice')}</p>
              <ul className="mt-3.5 grid gap-2">
                {[
                  { label: t('site1'), on: true },
                  { label: t('site2'), on: false },
                ].map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center gap-3 rounded-field border border-line bg-glass-3 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-label font-medium text-fg-2">
                      {nb(s.label)}
                    </span>
                    <FakeSwitch on={s.on} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-label leading-[1.5] text-muted">{nb(t('extensionNever'))}</p>
            </div>
            <div className={cn(CARD, 'flex flex-col p-4')}>
              <p className="flex items-center gap-2 text-ui font-semibold text-fg">
                <Terminal strokeWidth={1.7} className="size-4 text-accent" />
                {t('codingAssistant')}
              </p>
              <div className="mt-3.5 flex-1 rounded-field border border-line bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-3 font-mono text-[11.5px] leading-[1.7] tracking-normal">
                <p className="text-muted">{t('sessionEnd')}</p>
                <p className="text-fg-2">
                  <span className="text-success">✓</span> {t('sent')}
                </p>
                <p className="text-muted">{t('textOnly')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Visual>
  );
}

function KeepVisual() {
  const t = useTranslations('site.product');
  const common = useTranslations('site.common');
  return (
    <Visual tilt={false} caption={t('keepCaption')} label={t('keepLabel')}>
      {/* overflow-x-clip : la scène des couches garde sa largeur sous 340 px (pas de défilement horizontal) */}
      <div className="relative min-h-[440px] overflow-x-clip sm:min-h-[520px]">
        <div className="site-halo pointer-events-none absolute inset-0 opacity-80 [mask:linear-gradient(180deg,transparent,#000_35%,#000_65%,transparent)]" />
        <Layers3D className="absolute inset-0" />
        <div className="site-float absolute bottom-2 left-1/2 z-[2] w-max -translate-x-1/2 rounded-field border border-line-strong bg-[color-mix(in_srgb,var(--menu)_88%,transparent)] px-3.5 py-2.5 font-mono text-[11.5px] tracking-normal shadow-float backdrop-blur-[16px]">
          <span className="text-fg-2">DB_PASSWORD</span>
          <span className="text-muted">=</span>
          <span className="rounded-[4px] bg-accent-soft px-1 text-accent">
            {common('maskedSecret')}
          </span>
        </div>
      </div>
    </Visual>
  );
}

function FindVisual() {
  const t = useTranslations('site.product');
  const common = useTranslations('site.common');
  const { demos, syntax } = useSiteContent();
  const demo = demos[1];
  return (
    <div className="site-reveal min-w-0">
      <Tilt max={5} scale={1.01} perspective={1400} className="rounded-panel">
        <div className={PANEL}>
          <div className="site-dots pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative grid gap-3">
            <div aria-hidden="true" className="grid gap-3">
              <DemoSearchField query={nb(demo?.query ?? '')} />
              {demo && <DemoAnswerCard demo={demo} />}
            </div>
            <div className={cn(CARD, 'px-2 py-1.5')}>
              <p className="px-2.5 pt-2.5 pb-1 font-mono text-meta font-medium tracking-[0.08em] text-muted uppercase">
                {t('typedInBar')}
              </p>
              <dl className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {syntax.map((s) => (
                  <div
                    key={s.code}
                    className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-3 rounded-field px-2.5 py-2"
                  >
                    <dt>
                      <QueryCode q={s.code} />
                    </dt>
                    <dd className="text-label text-fg-2">{nb(s.text)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="fx-pop pointer-events-none absolute -top-4 right-4 z-[4] [--pop:60px] sm:-right-3"
        >
          <div className="site-float rounded-full border border-accent-line bg-[color-mix(in_srgb,var(--menu)_86%,transparent)] px-3.5 py-2 font-mono text-meta tracking-normal text-accent shadow-float backdrop-blur-[16px]">
            {t('findChip')}
          </div>
        </div>
      </Tilt>
      <p className={FICTIF}>{nb(common('searchScreen'))}</p>
    </div>
  );
}

// Les quatre outils du serveur MCP, sous leur vrai nom ; ce qu'ils font est dans site.product.mcp.
const MCP_TOOLS = ['search', 'fetch', 'briefing', 'remember'] as const;

function DiscussVisual() {
  const t = useTranslations('site.product');
  const { demos, briefing } = useSiteContent();
  const demo = demos[2];
  return (
    <Visual caption={t('discussCaption')} label={t('discussLabel')} chip={t('discussChip')}>
      <div className={PANEL}>
        <div className="site-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative grid gap-3">
          <div className={cn(CARD, 'p-4')}>
            <div className="flex items-center gap-2 text-label text-muted">
              <MessagesSquare strokeWidth={1.7} className="size-4 text-accent" />
              {t('discussionPrivate')}
            </div>
            <p className="mt-3 ml-auto w-fit max-w-[85%] rounded-[16px] rounded-br-[6px] bg-accent-soft px-3.5 py-2.5 text-ui text-fg shadow-[inset_0_0_0_1px_var(--accent-line)]">
              {nb(demo?.query ?? '')}
            </p>
            <div className="mt-3 max-w-[94%]">
              <LeonMark label="Leon" />
              <CitedAnswer
                text={demo?.answer ?? ''}
                className="mt-2 text-label leading-[1.7] text-fg-2"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className={cn(CARD, 'p-4')}>
              <p className="flex items-center gap-2 text-ui font-semibold text-fg">
                <Sunrise strokeWidth={1.7} className="size-4 text-accent" />
                {t('theBriefing')}
              </p>
              <div className="mt-3 grid gap-2.5">
                {briefing.map((part) => (
                  <div key={part.title}>
                    <p className="font-mono text-meta tracking-normal text-accent">{part.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-label leading-[1.5] text-fg-2">
                      {nb(part.items[0])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(CARD, 'p-4')}>
              <p className="text-ui font-semibold text-fg">{t('mcpServer')}</p>
              <ul className="mt-3 grid grid-cols-1 gap-1.5">
                {MCP_TOOLS.map((name) => (
                  <li key={name} className="flex items-baseline gap-2">
                    <code className="rounded-[5px] border border-line bg-glass-3 px-1.5 font-mono text-[11.5px] text-fg">
                      {name}
                    </code>
                    <span className="min-w-0 truncate text-label text-muted">
                      {nb(t(`mcp.${name}`))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-meta tracking-normal text-muted">{t('token')}</p>
            </div>
          </div>
        </div>
      </div>
    </Visual>
  );
}

const VISUALS: Record<string, () => ReactNode> = {
  capte: CaptureVisual,
  garde: KeepVisual,
  retrouve: FindVisual,
  discute: DiscussVisual,
};

function PillarSection({ pillar, index }: { pillar: Pillar; index: number }) {
  const Vis = VISUALS[pillar.id];
  const flip = index % 2 === 1;
  return (
    <PageSection id={pillar.id} labelledBy={`${pillar.id}-titre`}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn('min-w-0', flip && 'lg:order-2')}>
          <div className="site-reveal">
            <Kicker>
              <span className="text-muted">0{index + 1}</span> {pillar.kicker}
            </Kicker>
            <h2
              id={`${pillar.id}-titre`}
              className="mt-3 text-[clamp(28px,3.6vw,42px)] leading-[1.08] font-bold tracking-[-0.035em] text-balance text-fg"
            >
              {nb(pillar.title)}
            </h2>
            <p className="mt-4 max-w-[540px] text-[17px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[15.5px]">
              {nb(pillar.text)}
            </p>
            <ul className="mt-7 grid gap-3">
              {pillar.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-body text-fg-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                    <Check aria-hidden="true" strokeWidth={2.4} className="size-3" />
                  </span>
                  {nb(p)}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={cn('min-w-0', flip && 'lg:order-1')}>{Vis && <Vis />}</div>
      </div>
    </PageSection>
  );
}

/**
 * Le chemin d'une information, en quatre étapes reliées (visuel du haut de page) : une pile de cartes de verre en 3D,
 * chacune un cran devant l'autre ; la carte survolée sort de la pile. À plat sous 1024 px (pages.css, .pg-stack).
 */
function FlowAside() {
  const t = useTranslations('site.product');
  const { pillars } = useSiteContent();
  return (
    <figure className="pg-stack relative py-4 lg:py-10">
      <figcaption className="sr-only">{nb(t('flowCaption'))}</figcaption>
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute -inset-10 opacity-80 [mask:radial-gradient(closest-side,#000,transparent)]"
      />
      <ol className="pg-stack-deck relative grid gap-3 lg:gap-4">
        {pillars.map((p, i) => (
          // preserve-3d : sans lui, le <li> aplatirait la profondeur de sa carte (translateZ) dans son plan
          <li
            key={p.id}
            className="relative min-w-0 [transform-style:preserve-3d]"
            style={{ '--i': i } as CSSProperties}
          >
            <a
              href={`#${p.id}`}
              className={cn(
                'pg-stack-card relative flex min-w-0 items-center gap-4 rounded-box border border-line-strong bg-[linear-gradient(160deg,color-mix(in_srgb,var(--menu)_88%,transparent),color-mix(in_srgb,var(--menu)_72%,transparent))] px-4 py-4 shadow-panel',
                i === pillars.length - 1 && 'signal-line',
              )}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft font-mono text-[13px] font-medium text-accent shadow-[0_0_0_6px_var(--accent-soft)]">
                0{i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-semibold text-fg">{p.kicker}</span>
                <span className="mt-0.5 block truncate text-label text-muted">{nb(p.title)}</span>
              </span>
              <span
                aria-hidden="true"
                className="font-mono text-meta tracking-normal text-muted max-sm:hidden"
              >
                →
              </span>
            </a>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// Ce qui n'est pas encore construit (site.product.next).
const NEXT = ['google', 'microsoft', 'files', 'invites', 'permissions'] as const;

export function ProduitPage() {
  const t = useTranslations('site.product');
  const cta = useTranslations('site.cta');
  const common = useTranslations('site.common');
  const { pillars, taglines } = useSiteContent();
  return (
    <>
      <PageHero
        kicker={cta('howItWorks')}
        title={t('heroTitle')}
        accent={t('heroAccent')}
        lead={t('heroLead')}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/connecteurs" variant="secondary">
              {cta('seeConnectors')}
            </CtaLink>
          </>
        }
        aside={<FlowAside />}
      />

      {pillars.map((p, i) => (
        <PillarSection key={p.id} pillar={p} index={i} />
      ))}

      <PageSection labelledBy="ensuite-titre">
        <SectionHeading
          id="ensuite-titre"
          kicker={common('next')}
          title={t('nextTitle')}
          lead={t('nextLead')}
        />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {NEXT.map((n) => (
            <li key={n} className="site-reveal">
              <Tilt className="h-full rounded-card border border-dashed border-line-strong bg-panel p-4 shadow-hi">
                {/* en bloc : une pastille en ligne serait enveloppée d'une boîte anonyme, à plat */}
                <PlannedBadge className="fx-pop flex w-fit" />
                <p className="mt-3 text-ui font-semibold text-fg">{nb(t(`next.${n}.title`))}</p>
                <p className="mt-1 text-label leading-[1.5] text-muted">
                  {nb(t(`next.${n}.text`))}
                </p>
              </Tilt>
            </li>
          ))}
        </ul>
      </PageSection>

      <CtaBand title={taglines.source} text={t('ctaText')} />
    </>
  );
}
