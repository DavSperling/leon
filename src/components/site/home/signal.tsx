import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import { ALL_TOOLS, DOCS_HREF, TOOL_COUNT, toolLabel, useSiteContent } from '../content';
import { AnswerSheet, DemoScene } from '../demo-card';
import { HomeMotion } from '../motion/home-motion';
import { CheckMark, ProgressMark } from '../pages/page-hero';
import { ArrowLink, CtaButtons, CtaLink, Marked, order, pick, ToolLogo, tone } from '../parts';
import { HeroTabs } from './hero-demo';
import { RightsSwitch } from './rights-switch';

// L'accueil « Papier » : la promesse et la réponse marquée aux couleurs de ses sources ; les trois règles (citée, « je
// ne sais pas », les droits) ; les connecteurs qui défilent ; le point du matin ; la bande des développeurs (MCP) ; ce
// qui est en place et ce qui est en cours ; la fin. Tout est rendu par le serveur sauf les onglets et les bascules.
// Le mouvement (motion/) s'accroche aux attributs data-… ; sans lui, la page est dans son état final.

function Hero() {
  const t = useTranslations('site.home');
  const cta = useTranslations('site.cta');
  const { demos } = useSiteContent();
  return (
    <section aria-labelledby="titre" className="s-hero">
      <div className="s-wrap s-grid s-top__grid">
        <h1 id="titre" className="s-h1 s-top__h1">
          <span className="s-line">
            <span>{nb(t('title').trim())}</span>
          </span>{' '}
          <span className="s-line">
            <span>
              <span className="s-swp">
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                {nb(t('titleAccent'))}
              </span>
            </span>
          </span>
        </h1>
        <p className="s-lead s-top__lead s-arrive" style={order(2)}>
          {nb(t('lead'))}
        </p>
        <div className="s-top__cta s-arrive" style={order(3)}>
          <CtaLink href="/inscription">{cta('create')}</CtaLink>
          <p className="s-small">{t('betaNote')}</p>
        </div>
      </div>
      <div className="s-arrive mt-6" style={order(4)}>
        <HeroTabs demos={demos.filter((d) => d.id !== 'inconnu')} />
      </div>
    </section>
  );
}

function Rule({
  k,
  id,
  title,
  mark,
  toneN,
  lead,
  children,
}: {
  k: number;
  id: string;
  title: string;
  mark: string;
  toneN: number;
  lead: string;
  children: ReactNode;
}) {
  const common = useTranslations('site.common');
  return (
    <div className="s-grid s-rule3" data-rule={k}>
      <div className="s-rule3__text s-rv" data-rule-text>
        <h2 id={id} className="s-h2">
          <Marked text={title} mark={mark} tone={toneN} />
        </h2>
        <p className="s-lead mt-5">{nb(lead)}</p>
      </div>
      <figure aria-labelledby={id} className="s-rule3__frag s-rv" data-rule-frag>
        {children}
        <figcaption className="s-fict mt-4">{common('fictional')}</figcaption>
      </figure>
    </div>
  );
}

function Rules() {
  const t = useTranslations('site.home');
  const { demos, rights } = useSiteContent();
  const bug = pick(demos, 'bug');
  const unknown = pick(demos, 'inconnu');
  return (
    <section aria-label={t('rulesLabel')} className="s-sec" data-rules>
      <div className="s-wrap">
        {/* Les noms des trois règles et leur repère : affichés seulement quand la section est épinglée (motion/rules.ts) */}
        <ol className="s-rules__list" data-rules-list>
          {(['cited', 'silent', 'yours'] as const).map((name, i) => (
            <li key={name}>
              <a
                href={`#${['regle-citee', 'regle-silence', 'regle-droits'][i]}`}
                data-rule-link={i + 1}
              >
                {t(`ruleNames.${name}`)}
              </a>
            </li>
          ))}
          <li aria-hidden="true" className="s-rules__marker" data-rules-marker />
        </ol>
        <Rule
          k={1}
          id="regle-citee"
          title={t('rule1Title')}
          mark={t('rule1Mark')}
          toneN={1}
          lead={t('rule1Lead')}
        >
          <DemoScene demo={bug} pile={false} />
        </Rule>
        <Rule
          k={2}
          id="regle-silence"
          title={t('rule2Title')}
          mark={t('rule2Mark')}
          toneN={4}
          lead={t('rule2Lead')}
        >
          <AnswerSheet demo={unknown}>
            <p className="s-small -mt-2 flex items-center gap-2.5 px-7 pb-5 max-sm:px-[18px]">
              {/* le drapeau vide : sa forme en trait, un tiret à la place du numéro */}
              <svg
                aria-hidden="true"
                viewBox="0 0 34 24"
                width="34"
                height="24"
                className="s-empty-flag"
              >
                <polygon points="1,1 33,1 25,12 33,23 1,23" pathLength={1} />
                <path d="M9 12h9" />
              </svg>
              <span data-flag-label>{t('noSource')}</span>
            </p>
          </AnswerSheet>
        </Rule>
        <Rule
          k={3}
          id="regle-droits"
          title={t('rule3Title')}
          mark={t('rule3Mark')}
          toneN={3}
          lead={t('rule3Lead')}
        >
          <RightsSwitch views={rights} />
        </Rule>
      </div>
    </section>
  );
}

/** Une rangée de fiches : les outils deux fois de suite (la seconde copie ferme la boucle). `reverse` : la rangée va
 *  vers la droite (le côté gauche de la pile). Décoratif : la liste complète est sur la page Connecteurs. */
function MarqueeRow({ tools, reverse }: { tools: ProviderId[]; reverse?: boolean }) {
  return (
    <div className="s-marquee__row" data-reverse={reverse || undefined}>
      {[0, 1].map((copy) =>
        tools.map((id) => (
          <span key={`${copy}-${id}`} className="s-tool">
            <ToolLogo id={id} size={22} lazy={false} />
            <span>{toolLabel(id)}</span>
          </span>
        )),
      )}
    </div>
  );
}

function Connectors() {
  const t = useTranslations('site.home');
  // quatre rangées, deux par côté : les fiches glissent des deux bords vers la pile de Leon, au milieu
  const per = Math.ceil(ALL_TOOLS.length / 4);
  const rows = [0, 1, 2, 3].map((i) => ALL_TOOLS.slice(i * per, (i + 1) * per));
  // le nombre à part, pour qu'il puisse compter jusqu'à lui (motion/ambient.ts) ; le serveur l'écrit en entier
  const title = t('connTitle', { count: TOOL_COUNT });
  const count = String(TOOL_COUNT);
  const at = title.indexOf(count);
  return (
    <section aria-labelledby="connecteurs" className="s-sec pt-0" data-home="connectors">
      <div className="s-wrap s-grid s-head s-rv">
        <h2 id="connecteurs" className="s-h2" data-rv="1">
          {at < 0 ? (
            <Marked text={title} mark={t('connMark')} tone={2} />
          ) : (
            <>
              {nb(title.slice(0, at))}
              <span data-count={TOOL_COUNT}>{count}</span>
              <Marked text={title.slice(at + count.length)} mark={t('connMark')} tone={2} />
            </>
          )}
        </h2>
        <p className="s-lead" data-rv="2">
          {nb(t('connLead'))}
        </p>
      </div>
      {/* Le bureau : chaque outil est une fiche, et toutes vont à la même pile (la marque : trois traits, un point) */}
      <div aria-hidden="true" className="s-marquee s-inflow" data-marquee>
        <div className="s-inflow__side">
          <MarqueeRow tools={rows[0] ?? []} reverse />
          <MarqueeRow tools={rows[1] ?? []} reverse />
        </div>
        <div className="s-inflow__side">
          <MarqueeRow tools={rows[2] ?? []} />
          <MarqueeRow tools={rows[3] ?? []} />
        </div>
        <div className="s-inflow__pile" data-inflow-pile>
          <div className="s-sheet">
            <Logo className="size-11" />
          </div>
        </div>
      </div>
      <div className="s-wrap mt-10 flex flex-wrap items-center gap-x-8 gap-y-2">
        <ArrowLink href="/connecteurs">{t('seeConnectors', { count: TOOL_COUNT })}</ArrowLink>
        <p className="s-small">{nb(t('connExtension'))}</p>
      </div>
    </section>
  );
}

function Briefing() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const { briefing } = useSiteContent();
  return (
    <section aria-labelledby="point" className="s-band s-desk" data-home="briefing">
      <div className="s-wrap s-grid items-center gap-y-12">
        <figure className="col-[1/13] s-rv min-[1100px]:col-[1/7]" data-rv="1" data-memo>
          <div className="s-memo s-sheet">
            <p className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden="true" className="strokes">
                <i />
                <i />
                <i />
              </span>
              {common('briefing')}
            </p>
            {briefing.map((part) => (
              <div key={part.title} className="mt-5">
                <h3 className="s-small mb-1 font-medium">{nb(part.title)}</h3>
                <ul>
                  {part.items.map((it) => (
                    <li key={it.text}>
                      <span className="min-w-0 flex-1">{nb(it.text)}</span>
                      <span className={`num ${tone(it.n)}`}>
                        <span className="sr-only">source </span>
                        {it.n}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <figcaption className="s-fict mt-4">{common('fictional')}</figcaption>
        </figure>
        <div className="col-[1/13] s-rv min-[1100px]:col-[8/13]" data-rv="2">
          <h2 id="point" className="s-h2">
            <Marked text={t('briefTitle')} mark={t('briefMark')} tone={4} />
          </h2>
          <p className="s-lead mt-5">{nb(t('briefLead'))}</p>
          <p className="s-small mt-4">{nb(t('briefSmall'))}</p>
          <ArrowLink href={DOCS_HREF} className="mt-6">
            {t('readDocs')}
          </ArrowLink>
        </div>
      </div>
    </section>
  );
}

function Developers() {
  const t = useTranslations('site.home');
  const common = useTranslations('site.common');
  const { demos } = useSiteContent();
  // ce que la recherche du terminal rend : les trois originaux de la question du haut de page
  const found = demos[0]?.sources ?? [];
  return (
    <section aria-labelledby="assistant" className="s-band s-ink" data-home="developers">
      <div className="s-wrap s-grid items-center gap-y-12">
        <div className="col-[1/13] s-rv min-[1100px]:col-[1/6]" data-rv="1">
          <h2 id="assistant" className="s-h2">
            {t('assistantTitle')}
          </h2>
          <p className="s-lead mt-5 text-[var(--s-on-band-2)]">{nb(t('assistantLead'))}</p>
          <ul className="mt-8 grid border-b border-[var(--s-band-line)]">
            {(['briefing', 'sessions', 'log'] as const).map((k) => (
              <li key={k} className="s-body border-t border-[var(--s-band-line)] py-3.5">
                {nb(t(`assistantPoints.${k}`))}
              </li>
            ))}
          </ul>
          <ArrowLink href="/produit#discute" className="mt-6">
            {t('assistantLink')}
          </ArrowLink>
        </div>
        <figure className="col-[1/13] s-rv min-[1100px]:col-[7/13]" data-rv="2" data-term>
          <div className="s-termwrap">
            <div className="s-term">
              <p className="s-term__bar">{t('terminal')}</p>
              <div aria-hidden="true" className="s-term__body">
                <p>
                  <span className="s-term__dim">›</span> search {t('terminalSearch')}
                </p>
                <p className="flex flex-wrap items-center gap-2 pl-4 s-term__dim">
                  {t('terminalSources')}
                  <ToolLogo id="linear" size={18} />
                  <ToolLogo id="hubspot" size={18} />
                  <ToolLogo id="granola" size={18} />
                </p>
                <p className="mt-3">
                  <span className="s-term__dim">›</span> fetch ticket ACME-214
                </p>
                <p className="mt-3">
                  <span className="s-term__dim">›</span> remember {t('terminalRemember')}
                </p>
                <p className="pl-4 s-term__dim">{t('terminalSaved')}</p>
              </div>
            </div>
            {/* les originaux sortent du terminal : une feuille posée sur son coin, une ligne par source */}
            <ol aria-hidden="true" className="s-sheet s-termdocs" data-term-docs>
              {found.map((src, i) => (
                <li key={src.title} className="s-note">
                  <span className={`num ${tone(i + 1)}`}>{i + 1}</span>
                  <ToolLogo id={src.tool} size={20} />
                  <span className="min-w-0">
                    <span className="s-note__t truncate">{nb(src.title)}</span>
                    <span className="s-note__m">
                      {toolLabel(src.tool)} · {src.kind}
                    </span>
                  </span>
                  <span />
                </li>
              ))}
            </ol>
          </div>
          <figcaption className="s-small mt-4">{common('fictional')}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Security() {
  const t = useTranslations('site.home');
  const { securityFacts, notYet } = useSiteContent();
  const lists = [
    { key: 'inPlace', items: securityFacts.slice(0, 3), progress: false },
    { key: 'inProgress', items: notYet, progress: true },
  ] as const;
  return (
    <section aria-labelledby="securite" className="s-sec" data-home="security">
      <div className="s-wrap s-grid gap-y-10">
        <div className="col-[1/13] s-rv min-[1100px]:col-[1/6]" data-rv="1">
          <h2 id="securite" className="s-h2">
            {t('secTitle')}
          </h2>
          <ArrowLink href="/securite" className="mt-6">
            {t('securityLink')}
          </ArrowLink>
        </div>
        {/* le bureau : ce qui est en place est une feuille posée ; ce qui est en cours, la même encore au crayon */}
        <div className="col-[1/13] s-ledger s-rv min-[1100px]:col-[6/13]" data-rv="2" data-checks>
          {lists.map((l) => (
            <div key={l.key} className={l.progress ? 's-sheet--draft' : 's-sheet'}>
              <h3>{t(l.key)}</h3>
              <ul className="s-facts">
                {l.items.map((f) => (
                  <li key={f.title}>
                    {l.progress ? <ProgressMark /> : <CheckMark />}
                    <span className="s-body">{nb(f.title)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** La fin : la dernière feuille de la pile, trois drapeaux qui dépassent, et les trois traits du haut sous les derniers
 *  mots (la page se ferme comme elle s'ouvre). */
function Closing() {
  const t = useTranslations('site.home');
  const { taglines } = useSiteContent();
  const mark = t('ctaMark');
  const at = taglines.dit.indexOf(mark);
  return (
    <section aria-labelledby="fin" className="s-band s-desk" data-home="closing">
      <div className="s-wrap">
        <div className="s-end">
          <div className="s-sheet s-grid s-close s-end__sheet">
            <span aria-hidden="true" className="s-end__flags">
              {[1, 2, 3].map((n) => (
                <span key={n} className={`flag flag--left ${tone(n)}`}>
                  {n}
                </span>
              ))}
            </span>
            <div className="s-close__text">
              <h2 id="fin" className="s-h2">
                {at < 0 ? (
                  nb(taglines.dit)
                ) : (
                  <>
                    {nb(taglines.dit.slice(0, at))}
                    <span className="s-swp">
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      {nb(mark)}
                    </span>
                    {nb(taglines.dit.slice(at + mark.length))}
                  </>
                )}
              </h2>
              <p className="s-lead mt-5">{nb(t('ctaText'))}</p>
            </div>
            <CtaButtons className="s-close__cta" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeSignal() {
  return (
    <>
      <Hero />
      <Rules />
      <Connectors />
      <Briefing />
      <Developers />
      <Security />
      <Closing />
      <HomeMotion />
    </>
  );
}
