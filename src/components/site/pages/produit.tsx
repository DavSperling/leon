import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { nb } from '@/lib/verre/nb';
import { type Pillar, useSiteContent } from '../content';
import { AnswerSheet, Pile } from '../demo-card';
import { CtaBand, CtaLink, order, pick, QueryCode, ToolLogo } from '../parts';
import { FactList, PageHero } from './page-hero';

// Page « Produit » : les quatre étapes (capter, garder, retrouver, discuter), chacune avec un fragment des vrais écrans
// posé sur le bureau, puis ce qui n'est pas encore construit. Exemples fictifs, fonctions réelles (état de main).

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

/** Un fragment illustratif sur le bureau : lu comme une image (sa légende pour les lecteurs d'écran), et la mention
 *  « Exemple fictif · label » dessous, visible de tous. */
function Visual({
  caption,
  label,
  children,
}: {
  caption: string;
  label: string;
  children: ReactNode;
}) {
  const common = useTranslations('site.common');
  return (
    <figure className="s-rule3__frag min-w-0">
      <div aria-hidden="true" data-pm="deal" className="grid gap-4">
        {children}
      </div>
      <figcaption className="s-fict mt-4">
        <span className="sr-only">{nb(`${caption} `)}</span>
        {nb(common('fictionalLabel', { label }))}
      </figcaption>
    </figure>
  );
}

function CaptureVisual() {
  const t = useTranslations('site.product');
  return (
    <Visual caption={t('captureCaption')} label={t('captureLabel')}>
      <div className="s-sheet px-6 py-5">
        <p className="font-semibold">{t('connected')}</p>
        <div data-pm="pops" className="mt-4 flex flex-wrap gap-4">
          {CAPTURED.map((id) => (
            <ToolLogo key={id} id={id} size={28} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="s-sheet px-6 py-5">
          <p className="font-semibold">{t('extension')}</p>
          <p className="s-small mt-0.5">{t('extensionChoice')}</p>
          <ul className="mt-3">
            {[
              { label: t('site1'), on: true },
              { label: t('site2'), on: false },
            ].map((x) => (
              <li
                key={x.label}
                className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[15px]"
              >
                {nb(x.label)}
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full ${x.on ? 'bg-ink' : 'bg-[var(--s-desk-3)]'}`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-[var(--s-sheet)] ${x.on ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="s-small mt-2">{nb(t('extensionNever'))}</p>
        </div>
        <div className="s-term">
          <p className="s-term__bar">{t('codingAssistant')}</p>
          <div data-pm="type" className="s-term__body">
            <p className="s-term__dim">{t('sessionEnd')}</p>
            <p>✓ {t('sent')}</p>
            <p className="s-term__dim">{t('textOnly')}</p>
          </div>
        </div>
      </div>
    </Visual>
  );
}

function KeepVisual() {
  const t = useTranslations('site.product');
  const common = useTranslations('site.common');
  const { demos } = useSiteContent();
  return (
    <Visual caption={t('keepCaption')} label={t('keepLabel')}>
      <Pile demo={pick(demos, 'promesse')} active={1} className="pr-6 pt-8" />
      <div className="s-term">
        <div className="s-term__body">
          DB_PASSWORD<span className="s-term__dim">=</span>
          {common('maskedSecret')}
        </div>
      </div>
    </Visual>
  );
}

function FindVisual() {
  const t = useTranslations('site.product');
  const common = useTranslations('site.common');
  const { demos, syntax } = useSiteContent();
  return (
    <figure className="s-rule3__frag min-w-0">
      <div aria-hidden="true" data-pm="land" data-pm-from="left">
        <AnswerSheet demo={pick(demos, 'bug')} />
      </div>
      <div className="s-sheet mt-4 px-6 py-5">
        <p className="font-semibold">{t('typedInBar')}</p>
        <dl data-pm="rise" className="mt-2">
          {syntax.map((x) => (
            <div
              key={x.code}
              className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-2.5"
            >
              <dt>
                <QueryCode q={x.code} />
              </dt>
              <dd className="text-[15px] text-muted">{nb(x.text)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className="s-fict mt-4">{nb(common('searchScreen'))}</figcaption>
    </figure>
  );
}

// Les huit outils du serveur MCP, sous leur vrai nom ; ce qu'ils font est dans site.product.mcp.
const MCP_TOOLS = [
  'search',
  'fetch',
  'threads',
  'thread',
  'versions',
  'lessons',
  'briefing',
  'remember',
] as const;

function DiscussVisual() {
  const t = useTranslations('site.product');
  const { demos } = useSiteContent();
  return (
    <Visual caption={t('discussCaption')} label={t('discussLabel')}>
      <AnswerSheet demo={pick(demos, 'depart')} />
      <div className="s-term">
        <p className="s-term__bar">{t('mcpServer')}</p>
        <div data-pm="type" className="s-term__body">
          {MCP_TOOLS.map((name) => (
            <p key={name}>
              {name.padEnd(9)} <span className="s-term__dim">{nb(t(`mcp.${name}`))}</span>
            </p>
          ))}
          <p className="s-term__dim mt-3">{t('token')}</p>
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
  return (
    <section id={pillar.id} aria-labelledby={`${pillar.id}-titre`} className="s-sec">
      <div className="s-wrap s-grid s-rule3">
        <div className="s-rule3__text s-rv">
          <p className="s-small flex items-center gap-2.5 font-medium text-fg">
            <span data-pm="pop" className={`num c${(index % 4) + 1}`}>
              {index + 1}
            </span>
            {pillar.kicker}
          </p>
          <h2 id={`${pillar.id}-titre`} className="s-h2 mt-4">
            {nb(pillar.title)}
          </h2>
          <p className="s-lead mt-5">{nb(pillar.text)}</p>
          <FactList className="mt-8" items={pillar.points.map((p) => ({ title: p, text: '' }))} />
        </div>
        {Vis && <Vis />}
      </div>
    </section>
  );
}

/** Les quatre étapes, en index sous le haut de page : chacune mène à sa section. */
function FlowIndex() {
  const t = useTranslations('site.product');
  const { pillars } = useSiteContent();
  return (
    <nav aria-label={t('flowCaption')}>
      <ol className="s-grid pg-flow gap-y-3">
        {pillars.map((p, i) => (
          <li
            key={p.id}
            style={order(i)}
            className="pg-land col-[span_12] sm:col-[span_6] min-[1100px]:col-[span_3]"
          >
            <a
              href={`#${p.id}`}
              className="s-sheet pg-lift flex h-full items-start gap-3 px-5 py-4"
            >
              <span className={`num c${(i % 4) + 1}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{p.kicker}</span>
                <span className="s-small mt-0.5 line-clamp-2 block">{nb(p.title)}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Ce qui n'est pas encore construit (site.product.next).
const NEXT = ['google', 'microsoft', 'files', 'invites', 'permissions'] as const;

export function ProduitPage() {
  const t = useTranslations('site.product');
  const cta = useTranslations('site.cta');
  const { pillars, taglines } = useSiteContent();
  return (
    <div className="s-page">
      <PageHero
        title={t('heroTitle')}
        accent={t('heroAccent')}
        tone={2}
        lead={t('heroLead')}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/connecteurs" variant="secondary">
              {cta('seeConnectors')}
            </CtaLink>
          </>
        }
        aside={<FlowIndex />}
      />

      {pillars.map((p, i) => (
        <PillarSection key={p.id} pillar={p} index={i} />
      ))}

      <section aria-labelledby="limites" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="limites" className="s-h2">
              {t('nextTitle')}
            </h2>
            <p className="s-lead mt-5">{nb(t('nextLead'))}</p>
          </div>
          <FactList
            progress
            className="s-split__body"
            items={NEXT.map((n) => ({ title: t(`next.${n}.title`), text: t(`next.${n}.text`) }))}
          />
        </div>
      </section>

      <CtaBand title={taglines.source} text={t('ctaText')} />
    </div>
  );
}
