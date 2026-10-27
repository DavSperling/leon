import {
  ArrowRight,
  CircleHelp,
  FileText,
  MessagesSquare,
  Quote,
  ShieldCheck,
  Terminal,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import { ALL_TOOLS, type Demo, TOOL_COUNT, useSiteContent } from '../content';
import { Layers3D, LogoSphere, ParticleField, SplitWords, Tilt } from '../fx';
import {
  ArrowLink,
  Cite,
  Container,
  CtaBand,
  CtaLink,
  Excerpt,
  Kicker,
  QueryCode,
  SectionHeading,
  ToolLogo,
} from '../parts';
import { TeamTabs } from '../team-tabs';
import { HeroDemo } from './hero-demo';
import './signal.css';

// Accueil « Signal » : la plus proche de l'appli. Un titre centré, puis la démo de la recherche (requête, faisceau,
// sources, réponse citée) comme point focal ; ensuite le problème, les trois temps, les équipes en onglets, la preuve
// (« La source, ou rien. »), l'assistant d'IA, la sécurité et les questions fréquentes.

const rise = (i: number) => ({ '--i': i }) as CSSProperties;

function Hero() {
  const t = useTranslations('site.home');
  const cta = useTranslations('site.cta');
  return (
    <section aria-labelledby="titre" className="relative overflow-hidden pt-32 pb-10 sm:pt-40">
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute inset-x-0 top-0 h-[760px]"
      />
      {/* un creux dans la nappe derrière le chapeau et les boutons : les points ne passent jamais sur le texte */}
      <div className="pointer-events-none absolute inset-x-0 top-[120px] h-[880px] opacity-90 [mask-image:radial-gradient(ellipse_230px_150px_at_50%_315px,transparent_60%,#000_100%)] sm:top-[60px] sm:[mask-image:radial-gradient(ellipse_470px_150px_at_50%_500px,transparent_62%,#000_100%)]">
        <ParticleField />
      </div>
      <Container className="relative">
        <div className="mx-auto max-w-[960px] text-center">
          <Link
            href="/produit"
            style={rise(0)}
            className="site-rise group inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-glass-2 py-1 pr-3.5 pl-1 text-label font-medium text-fg-2 backdrop-blur-[14px] transition-colors duration-200 hover:border-accent-line hover:text-fg"
          >
            <span className="rounded-full bg-accent-soft px-2.5 py-[3px] font-mono text-[11px] tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
              {t('beta')}
            </span>
            {nb(t('pill'))}
            <ArrowRight
              aria-hidden="true"
              strokeWidth={2}
              className="size-3.5 text-accent transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </Link>
          <h1
            id="titre"
            className="mt-7 text-[clamp(40px,7.2vw,86px)] leading-[0.98] font-extrabold tracking-[-0.052em] text-balance text-fg"
          >
            <SplitWords
              delay={120}
              parts={[{ text: t('title') }, { text: t('titleAccent'), className: 'site-gradient' }]}
            />
          </h1>
          <p
            style={rise(2)}
            className="site-rise mx-auto mt-6 max-w-[660px] text-[18px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[16px]"
          >
            {nb(t('lead'))}
          </p>
          <div
            style={rise(3)}
            className="site-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/produit" variant="secondary">
              {cta('seeHowItWorks')}
            </CtaLink>
          </div>
          <p
            style={rise(4)}
            className="site-rise mt-5 font-mono text-meta tracking-normal text-muted"
          >
            {t('betaNote')}
          </p>
        </div>
        <div style={rise(5)} className="site-rise mx-auto mt-14 max-w-[1100px] sm:mt-16">
          <div className="fx-untilt">
            <Tilt max={2.5} scale={1} perspective={1800} glare={false}>
              <HeroDemo />
            </Tilt>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ToolsStrip() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const { toolGroups } = useSiteContent();
  return (
    <section aria-labelledby="outils-titre" className="relative py-16 sm:py-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="site-reveal max-lg:text-center">
          <Kicker>{common('connectors')}</Kicker>
          <h2
            id="outils-titre"
            className="mt-3 text-[clamp(30px,4.4vw,52px)] leading-[1.04] font-extrabold tracking-[-0.045em] text-balance text-fg"
          >
            {nb(t('toolsTitle', { count: TOOL_COUNT }))}
            <span className="site-gradient">{nb(t('toolsTitleAccent'))}</span>
          </h2>
          <p className="mt-5 max-w-[480px] text-[17px] leading-[1.6] text-fg-2 max-lg:mx-auto">
            {nb(t('toolsLead'))} <span aria-hidden="true">{t('spin')}</span>
          </p>
          <ul className="mt-7 flex flex-wrap gap-2 max-lg:justify-center">
            {toolGroups.map((g) => (
              <li
                key={g.family}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-glass-3 px-3 py-1.5 text-label font-medium text-fg-2"
              >
                {g.label}
                <span className="font-mono text-[11px] text-accent">{g.tools.length}</span>
              </li>
            ))}
          </ul>
          <ArrowLink href="/connecteurs" className="mt-8">
            {t('seeConnectors', { count: TOOL_COUNT })}
          </ArrowLink>
        </div>
        <div className="site-reveal mx-auto w-full max-w-[560px]">
          <LogoSphere tools={ALL_TOOLS} size={44} />
        </div>
      </Container>
    </section>
  );
}

// Les textes sont dans site.home.problems (messages) ; l'ordre suit celui des visuels.
const PROBLEMS = ['scattered', 'departures', 'privateAi'] as const;

// Logos épars (outil, gauche %, haut %, rotation) : l'information dispersée.
const SCATTER: Array<[ProviderId, number, number, number]> = [
  ['outlook', 2, 8, -8],
  ['hubspot', 24, 52, 6],
  ['linear', 44, 4, -4],
  ['granola', 62, 50, 9],
  ['notion', 82, 12, -6],
  ['zendesk', 10, 68, 4],
  ['asana', 72, 74, -10],
];

function ProblemVisual({ i }: { i: number }) {
  const t = useTranslations('site.home');
  if (i === 0)
    return (
      <div aria-hidden="true" className="relative h-[132px]">
        {SCATTER.map(([id, x, y, r]) => (
          <span
            key={id}
            className="sig-bob absolute"
            style={{ left: `${x}%`, top: `${y}%`, rotate: `${r}deg` } as CSSProperties}
          >
            <ToolLogo id={id} size={34} />
          </span>
        ))}
      </div>
    );
  if (i === 1)
    return (
      <div aria-hidden="true" className="grid h-[132px] content-center gap-2">
        {[t('tasks.quote'), t('tasks.ship'), t('tasks.migrate')].map((task, k) => (
          <div
            key={task}
            className="flex items-center gap-2.5 rounded-field border border-line bg-glass-3 px-3 py-2 text-label text-fg-2"
            style={{ opacity: 1 - k * 0.15 }}
          >
            <span className="size-3.5 rounded-full border border-line-strong" />
            <span className="truncate">{nb(task)}</span>
            <span className="ml-auto font-mono text-[10.5px] text-muted">Thomas</span>
          </div>
        ))}
      </div>
    );
  return (
    <div aria-hidden="true" className="grid h-[132px] content-center gap-2">
      <div className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[4px] bg-accent-soft px-3 py-2 text-label text-fg shadow-[inset_0_0_0_1px_var(--accent-line)]">
        {nb(t('chatQuestion'))}
      </div>
      <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] border border-line bg-glass-3 px-3 py-2 text-label text-fg-2">
        {nb(t('chatAnswer'))}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-normal text-muted">
        <MessagesSquare strokeWidth={1.7} className="size-3" />
        {t('chatNote')}
      </div>
    </div>
  );
}

function Problem() {
  const t = useTranslations('site.home');
  return (
    <section aria-labelledby="probleme" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="probleme"
          kicker={t('problemKicker')}
          title={t('problemTitle')}
          align="center"
        />
        <ul className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <li key={p} className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                <div className="fx-pop">
                  <ProblemVisual i={i} />
                </div>
                <h3 className="mt-5 text-title font-semibold tracking-[-0.015em] text-fg">
                  {nb(t(`problems.${p}.title`))}
                </h3>
                <p className="mt-2 text-body leading-[1.6] text-muted">
                  {nb(t(`problems.${p}.text`))}
                </p>
              </Tilt>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Steps() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const cta = useTranslations('site.cta');
  const sample = useTranslations('site.sample');
  return (
    <section aria-labelledby="etapes" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="etapes"
          kicker={cta('howItWorks')}
          title={t('stepsTitle')}
          lead={t('stepsLead')}
        />
        <div className="relative mt-14">
          {/* fil qui relie les trois temps */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute top-[30px] right-[16%] left-[16%] h-2 max-lg:hidden"
            preserveAspectRatio="none"
            viewBox="0 0 100 2"
          >
            <line
              x1="0"
              y1="1"
              x2="100"
              y2="1"
              stroke="var(--accent-line)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className="site-flow"
            />
          </svg>
          <ol className="relative grid gap-4 lg:grid-cols-3">
            <li className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                <StepNumber n="01" />
                <h3 className="mt-5 text-title font-semibold text-fg">{t('step1Title')}</h3>
                <p className="mt-2 text-body leading-[1.6] text-muted">
                  {nb(t('step1Text', { count: TOOL_COUNT }))}
                </p>
                <div aria-hidden="true" className="mt-5 grid gap-2">
                  <div className="grid grid-cols-6 gap-2">
                    {(
                      ['github', 'notion', 'hubspot', 'linear', 'granola', 'intercom'] as const
                    ).map((id) => (
                      <ToolLogo key={id} id={id} size={34} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 rounded-field border border-line bg-glass-3 px-3 py-2.5 text-label text-fg-2">
                    <span className="size-2 rounded-full bg-ok" />
                    {t('step1Extension')}
                    <span className="ml-auto inline-flex h-5 w-9 items-center rounded-full bg-accent p-0.5">
                      <span className="ml-auto size-4 rounded-full bg-accent-ink" />
                    </span>
                  </div>
                </div>
              </Tilt>
            </li>

            <li className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                <StepNumber n="02" />
                <h3 className="mt-5 text-title font-semibold text-fg">{t('step2Title')}</h3>
                <p className="mt-2 text-body leading-[1.6] text-muted">{nb(t('step2Text'))}</p>
                <div aria-hidden="true" className="mt-5 grid gap-2">
                  <div className="rounded-field border border-line bg-glass-3 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-label font-semibold text-fg">
                      <ToolLogo id="granola" size={20} />
                      {sample('meeting')}
                      <span className="ml-auto font-mono text-[10.5px] font-normal text-muted">
                        {t('step2Date')}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-label text-muted">
                      {nb(t('step2Quote'))}
                    </p>
                    <p className="mt-1.5 text-label font-semibold text-accent">{t('step2Open')}</p>
                  </div>
                  <code className="block rounded-field border border-line bg-glass-3 px-3 py-2.5 font-mono text-[12px] text-fg-2">
                    <span className="text-muted">DB_PASSWORD=</span>
                    <span className="rounded-[4px] bg-mark-bg px-1 text-mark-ink">
                      {common('maskedSecret')}
                    </span>
                  </code>
                </div>
              </Tilt>
            </li>

            <li className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                <StepNumber n="03" />
                <h3 className="mt-5 text-title font-semibold text-fg">{t('step3Title')}</h3>
                <p className="mt-2 text-body leading-[1.6] text-muted">{nb(t('step3Text'))}</p>
                <div aria-hidden="true" className="mt-5 grid gap-2">
                  <div className="flex h-10 items-center gap-2 rounded-field border border-line-strong bg-glass-2 px-3">
                    <QueryCode q={t('step3Query')} />
                  </div>
                  <div className="signal-line relative overflow-hidden rounded-field border border-line bg-glass-2 px-3 py-2.5 text-label leading-[1.6] text-fg">
                    {nb(t('step3Answer1'))}
                    <Cite n={1} />
                    {nb(t('step3Answer2'))}
                    <Cite n={2} />.
                  </div>
                </div>
              </Tilt>
            </li>
          </ol>
        </div>
        <p className="mt-4 font-mono text-meta tracking-normal text-muted">
          {common('fictionalPlural')}
        </p>
      </Container>
    </section>
  );
}

function StepNumber({ n }: { n: string }) {
  return (
    <span className="relative z-[1] inline-grid size-[44px] place-items-center rounded-full border border-accent-line bg-[color-mix(in_srgb,var(--bg)_70%,var(--accent-soft))] font-mono text-ui font-medium text-accent shadow-[0_0_0_6px_color-mix(in_srgb,var(--bg)_80%,transparent)]">
      {n}
    </span>
  );
}

// Les trois couches, dans l'ordre (site.layers, partagé avec le visuel Layers3D).
const LAYERS = ['raw', 'index', 'rights'] as const;

function UnderTheHood() {
  const t = useTranslations('site.home');
  const layers = useTranslations('site.layers');
  const common = useTranslations('site.common');
  return (
    <section aria-labelledby="couches" className="relative overflow-hidden py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <SectionHeading
            id="couches"
            kicker={t('layersKicker')}
            title={t('layersTitle')}
            lead={t('layersLead')}
          />
          <ol className="mt-8 grid gap-3">
            {LAYERS.map((l, i) => (
              <li
                key={l}
                className="site-reveal flex gap-4 rounded-box border border-line bg-panel p-4 shadow-hi"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft font-mono text-label text-accent">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-ui font-semibold text-fg">
                    {nb(layers(`${l}.title`))}
                  </span>
                  <span className="mt-0.5 block text-label leading-[1.55] text-muted">
                    {nb(layers(`${l}.text`))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative min-h-[460px] sm:min-h-[540px]">
          <div
            aria-hidden="true"
            className="site-halo absolute inset-0 opacity-70 [mask:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)]"
          />
          <Layers3D className="absolute inset-0" />
          <p className="absolute right-0 bottom-0 font-mono text-meta tracking-normal text-muted">
            {common('fictional')}
          </p>
        </div>
      </Container>
    </section>
  );
}

function UseCases() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  return (
    <section aria-labelledby="equipes" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="equipes"
          kicker={common('useCases')}
          title={t('useCasesTitle')}
          lead={t('useCasesLead')}
          align="center"
        />
        <div className="mt-12">
          <TeamTabs />
        </div>
      </Container>
    </section>
  );
}

// Les textes sont dans site.home.proofs (messages) : ici, l'icône de chaque preuve.
const PROOFS = [
  { icon: Quote, key: 'cited' },
  { icon: CircleHelp, key: 'unknown' },
  { icon: Users, key: 'private' },
  { icon: FileText, key: 'raw' },
] as const;

function Proof() {
  const t = useTranslations('site.home');
  const unknown = useSiteContent().demos[3] as Demo;
  return (
    <section aria-labelledby="preuve" className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="site-reveal">
            <Kicker>{t('proofKicker')}</Kicker>
            <h2
              id="preuve"
              className="mt-4 text-[clamp(44px,7vw,96px)] leading-[0.92] font-extrabold tracking-[-0.055em] text-fg"
            >
              {nb(t('proofTitle'))}
              <br />
              <span className="site-gradient">{nb(t('proofTitleAccent'))}</span>
            </h2>
            <p className="mt-6 max-w-[480px] text-[17px] leading-[1.6] text-fg-2">
              {nb(t('proofLead'))}
            </p>
            <div className="mt-8 max-w-[480px] rounded-box border border-warning-line bg-warning-soft p-4">
              <p className="font-mono text-meta tracking-normal text-warning">
                {nb(unknown.query)}
              </p>
              <p className="mt-2 text-body leading-[1.6] text-fg">
                <Excerpt text={t('proofUnknown')} />
              </p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROOFS.map((p) => (
              <li key={p.key} className="site-reveal">
                <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                  <span className="grid size-10 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
                    <p.icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
                  </span>
                  <h3 className="mt-5 text-title font-semibold tracking-[-0.015em] text-fg">
                    {nb(t(`proofs.${p.key}.title`))}
                  </h3>
                  <p className="mt-2 text-body leading-[1.6] text-muted">
                    {nb(t(`proofs.${p.key}.text`))}
                  </p>
                </Tilt>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function Assistant() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const { briefing } = useSiteContent();
  return (
    <section aria-labelledby="assistant" className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="lg:order-2">
            <SectionHeading
              id="assistant"
              kicker={t('assistantKicker')}
              title={t('assistantTitle')}
              lead={t('assistantLead')}
            />
            <ul className="mt-8 grid gap-3 text-body text-fg-2">
              {(['briefing', 'sessions', 'log'] as const).map((k) => (
                <li key={k} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {nb(t(`assistantPoints.${k}`))}
                </li>
              ))}
            </ul>
            <ArrowLink href="/produit#discute" className="mt-8">
              {t('assistantLink')}
            </ArrowLink>
          </div>
          <div className="grid gap-4 lg:order-1">
            <div className="site-reveal">
              <Tilt
                max={4}
                className="overflow-hidden rounded-box border border-line-strong bg-glass-2 shadow-panel"
              >
                <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 font-mono text-meta tracking-normal text-muted">
                  <Terminal aria-hidden="true" strokeWidth={1.7} className="size-3.5" />
                  {t('terminal')}
                </div>
                <div
                  aria-hidden="true"
                  className="grid gap-3 px-4 py-4 font-mono text-[12.5px] leading-[1.6] tracking-normal"
                >
                  <p>
                    <span className="text-accent">›</span> <span className="text-fg">search</span>{' '}
                    <span className="text-muted">{t('terminalSearch')}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-2 pl-4 text-fg-2">
                    3 sources
                    <ToolLogo id="linear" size={18} />
                    <ToolLogo id="hubspot" size={18} />
                    <ToolLogo id="granola" size={18} />
                  </p>
                  <p>
                    <span className="text-accent">›</span> <span className="text-fg">fetch</span>{' '}
                    <span className="text-muted">ticket ACME-214</span>
                  </p>
                  <p>
                    <span className="text-accent">›</span> <span className="text-fg">remember</span>{' '}
                    <span className="text-muted">{t('terminalRemember')}</span>
                  </p>
                  <p className="pl-4 text-success">{t('terminalSaved')}</p>
                </div>
              </Tilt>
            </div>
            <div className="site-reveal">
              <Tilt
                max={4}
                className="signal-line overflow-hidden rounded-box border border-line bg-panel p-5 shadow-hi"
              >
                <div className="flex items-center gap-2">
                  <Logo className="size-[18px]" />
                  <span className="text-[13px] font-semibold text-accent">
                    {common('briefing')}
                  </span>
                  <span className="ml-auto font-mono text-meta tracking-normal text-muted">
                    {t('briefingMeta')}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {briefing.map((part) => (
                    <div key={part.title}>
                      <p className="font-mono text-meta tracking-normal text-fg-2">
                        {nb(part.title)}
                      </p>
                      <ul className="mt-2 grid gap-1.5">
                        {part.items.map((it) => (
                          <li key={it} className="text-label leading-[1.5] text-muted">
                            {nb(it)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Tilt>
            </div>
            <p className="font-mono text-meta tracking-normal text-muted">{common('fictional')}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Security() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const { securityFacts } = useSiteContent();
  return (
    <section aria-labelledby="securite" className="py-20 sm:py-28">
      <Container>
        <div className="site-reveal relative overflow-hidden rounded-panel border border-line bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-6 shadow-panel backdrop-blur-[30px] sm:p-10">
          <div
            aria-hidden="true"
            className="site-dots pointer-events-none absolute inset-0 opacity-70"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[560px]">
              <Kicker>{common('security')}</Kicker>
              <h2
                id="securite"
                className="mt-3 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-fg"
              >
                {nb(t('securityTitle'))}
              </h2>
            </div>
            <ArrowLink href="/securite">{t('securityLink')}</ArrowLink>
          </div>
          <ul className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {securityFacts.slice(0, 4).map((f) => (
              <li key={f.title} className="rounded-box border border-line bg-glass-3 p-5">
                <ShieldCheck aria-hidden="true" strokeWidth={1.7} className="size-5 text-accent" />
                <h3 className="mt-4 text-ui font-semibold text-fg">{nb(f.title)}</h3>
                <p className="mt-1.5 text-label leading-[1.55] text-muted">{nb(f.text)}</p>
              </li>
            ))}
          </ul>
          <p className="relative mt-6 text-label text-muted">
            {nb(t('securityNotYet'))}
            <Link
              href="/securite#pas-encore"
              className="font-semibold text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              {nb(t('securityList'))}
            </Link>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}

function Faq() {
  const t = useTranslations('site.home');
  const { faq } = useSiteContent();
  return (
    <section aria-labelledby="faq" className="py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="site-reveal">
          <Kicker>{t('faqKicker')}</Kicker>
          <h2
            id="faq"
            className="mt-3 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-fg"
          >
            {nb(t('faqTitle'))}
          </h2>
          <ArrowLink href="/tarifs" className="mt-6">
            {t('faqLink')}
          </ArrowLink>
        </div>
        <div className="grid gap-2">
          {faq.slice(0, 4).map((f) => (
            <details
              key={f.q}
              className="site-reveal group rounded-box border border-line bg-panel shadow-hi open:border-line-strong open:bg-glass-2"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-ui font-semibold text-fg [&::-webkit-details-marker]:hidden">
                {nb(f.q)}
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-accent transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-body leading-[1.65] text-muted">{nb(f.a)}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function HomeSignal() {
  const t = useTranslations('site.home');
  const { taglines } = useSiteContent();
  return (
    <>
      <Hero />
      <ToolsStrip />
      <Problem />
      <Steps />
      <UnderTheHood />
      <UseCases />
      <Proof />
      <Assistant />
      <Security />
      <Faq />
      <CtaBand title={taglines.dit} text={t('ctaText')} />
    </>
  );
}
