import { useTranslations } from 'next-intl';
import { nb } from '@/lib/verre/nb';
import { TOOL_COUNT } from '../content';
import { CtaBand, CtaLink, Marked } from '../parts';
import { ConnecteursApercu } from './connecteurs-apercu';
import { ConnecteursCatalogue } from './connecteurs-catalogue';
import { FactList, PageHero } from './page-hero';

// Page « Connecteurs » : le catalogue filtrable des outils (ce que Leon lit de chacun), les quatre étapes d'un
// branchement, les conversations d'IA sur la bande d'encre, ce qui n'est pas encore pris en charge. Les deux sites
// d'assistants que capte l'extension ne sont pas nommés (marketing.md, publicité comparative).

const STEPS = ['pick', 'auth', 'period', 'test'] as const;
const CHANNELS = ['extension', 'coding', 'mcp'] as const;
const PLANNED = ['google', 'microsoft', 'files'] as const;

export function ConnecteursPage() {
  const t = useTranslations('site.connectors');
  const cta = useTranslations('site.cta');
  return (
    <div className="s-page">
      <PageHero
        title={t('heroTitle', { count: TOOL_COUNT })}
        accent={t('heroAccent')}
        tone={2}
        lead={t('heroLead')}
        actions={<CtaLink href="/inscription">{cta('create')}</CtaLink>}
        note={t('note')}
        aside={<ConnecteursApercu />}
      />

      <section id="catalogue" aria-labelledby="catalogue-titre" className="s-sec">
        <div className="s-wrap">
          <h2 id="catalogue-titre" className="sr-only">
            {t('catalogTitle')}
          </h2>
          <ConnecteursCatalogue />
          <p className="s-small mt-8 max-w-[44em]">{nb(t('betaNote'))}</p>
        </div>
      </section>

      <section aria-labelledby="brancher" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="brancher" className="s-h2">
              {t('connectTitle')}
            </h2>
            <p className="s-lead mt-5">{nb(t('connectLead'))}</p>
          </div>
          <ol data-pm="pops" className="s-facts s-split__body">
            {STEPS.map((s, i) => (
              <li key={s}>
                <span aria-hidden="true" className="num c2 mt-0.5">
                  {i + 1}
                </span>
                <h3 className="s-h3">{nb(t(`steps.${s}.title`))}</h3>
                <p className="s-body">{nb(t(`steps.${s}.text`))}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="ia" aria-labelledby="ia-titre" className="s-band s-ink">
        <div className="s-wrap">
          <div className="s-grid s-head s-rv">
            <h2 id="ia-titre" className="s-h2">
              <Marked text={t('aiTitle')} mark={t('aiAccent')} tone={3} />
            </h2>
            <p className="s-lead text-[var(--s-on-band-2)]">{nb(t('aiLead'))}</p>
          </div>
          <ul data-pm="rise" className="s-grid mt-14 gap-y-12">
            {CHANNELS.map((c) => (
              <li
                key={c}
                className="col-[1/13] border-t border-[var(--s-band-line)] pt-6 min-[1100px]:col-[span_4]"
              >
                <h3 className="s-h3">{t(`channels.${c}.title`)}</h3>
                <p className="s-body mt-2 text-[var(--s-on-band-2)]">
                  {nb(t(`channels.${c}.text`))}
                </p>
                <ul className="mt-5 grid gap-1.5">
                  {(['p1', 'p2', 'p3'] as const).map((p) => (
                    <li key={p} className="s-small flex gap-2.5">
                      <span aria-hidden="true">–</span>
                      {nb(t(`channels.${c}.${p}`))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="pas-encore" aria-labelledby="prevu" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="prevu" className="s-h2">
              {t('plannedTitle')}
            </h2>
            <p className="s-lead mt-5">{nb(t('plannedLead'))}</p>
          </div>
          <FactList
            progress
            className="s-split__body"
            items={PLANNED.map((p) => ({
              title: t(`planned.${p}.title`),
              text: t(`planned.${p}.text`),
            }))}
          />
        </div>
      </section>

      <CtaBand title={t('ctaTitle')} mark={t('ctaAccent')} tone={2} text={t('ctaText')} />
    </div>
  );
}
