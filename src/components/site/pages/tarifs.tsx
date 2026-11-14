import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { nb } from '@/lib/verre/nb';
import { TOOL_COUNT, useSiteContent } from '../content';
import { CtaBand, CtaLink } from '../parts';
import { CheckMark, PageHero } from './page-hero';

// Page « Tarifs » : le prix tel qu'il est aujourd'hui (un pilote gratuit, un prix proposé), une seule table posée comme
// une feuille sur le bureau (les trois offres, puis ce que toutes ont en commun), les questions, ouvertes. La colonne du
// pilote est une feuille posée sur la grille (pages.css, .pg-plans) : c'est par elle qu'on commence.

const EVERY_PLAN = [
  {
    row: 'rowConnectors',
    key: 'connectors',
    link: { href: '/connecteurs', label: 'seeConnectors' },
  },
  { row: 'rowSearch', key: 'search' },
  { row: 'rowChat', key: 'chat' },
  { row: 'rowBriefing', key: 'briefing' },
  { row: 'rowCapture', key: 'capture' },
  { row: 'rowProtection', key: 'protection', link: { href: '/securite', label: 'readSecurity' } },
] as const;

/** Le prix du pilote, entouré à la plume : c'est par lui qu'on commence. */
function Ringed({ children }: { children: ReactNode }) {
  return (
    <span className="pg-ring">
      {children}
      <svg viewBox="0 0 120 56" preserveAspectRatio="none" aria-hidden="true">
        <path
          pathLength={1}
          d="M22 12C44 3 84 3 104 14c16 9 12 27-8 34-24 8-62 6-80-6C2 32 6 17 26 10c14-5 34-6 50-3"
        />
      </svg>
    </span>
  );
}

export function TarifsPage() {
  const t = useTranslations('site.pricing');
  const cta = useTranslations('site.cta');
  const { plans, faq } = useSiteContent();
  const names = plans.map((p) => p.name);
  return (
    <div className="s-page">
      <PageHero
        title={t('heroTitle')}
        accent={t('heroAccent')}
        tone={1}
        lead={t('heroLead')}
        actions={<CtaLink href="/inscription">{cta('create')}</CtaLink>}
        note={t('note')}
      />

      <section aria-labelledby="offres" className="s-stage">
        <div className="s-wrap">
          <h2 id="offres" className="sr-only">
            {t('plans')}
          </h2>
          <div className="s-table s-sheet pg-land pg-plans">
            <table aria-labelledby="offres">
              <thead>
                <tr>
                  <td />
                  {plans.map((p) => (
                    <th key={p.id} scope="col">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t('rowPrice')}</th>
                  {plans.map((p, i) => (
                    <td key={p.id} data-plan={p.name}>
                      <span className="s-table__price">
                        {i === 0 ? <Ringed>{nb(p.price)}</Ringed> : nb(p.price)}
                      </span>
                      <span className="s-small">{nb(p.unit)}</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t('rowFor')}</th>
                  {plans.map((p) => (
                    <td key={p.id} data-plan={p.name}>
                      {nb(p.text)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t('rowBilling')}</th>
                  {plans.map((p) => (
                    <td key={p.id} data-plan={p.name}>
                      {nb(p.billing)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{t('rowHosting')}</th>
                  <td colSpan={2} data-plan={`${names[0]}, ${names[1]}`}>
                    {nb(t('hostingShared'))}
                  </td>
                  <td data-plan={names[2]}>{nb(t('hostingDedicated'))}</td>
                </tr>
              </tbody>
              <tbody data-pm="included">
                <tr className="s-table__group">
                  <th scope="colgroup" colSpan={4}>
                    <span className="block text-[1.125rem] font-semibold text-fg">
                      {t('everyPlan')}
                    </span>
                    <span className="s-small mt-1 block font-normal">{nb(t('everyPlanNote'))}</span>
                  </th>
                </tr>
                {EVERY_PLAN.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">
                      <span className="pg-inc">
                        <CheckMark />
                        {t(r.row)}
                      </span>
                    </th>
                    <td colSpan={3}>
                      {nb(t(`every.${r.key}`, { count: TOOL_COUNT }))}
                      {'link' in r && (
                        <>
                          {' '}
                          <Link href={r.link.href} className="s-tlink">
                            {nb(t(r.link.label))}
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="s-small mt-5">{nb(t('taxNote'))}</p>
        </div>
      </section>

      <section aria-labelledby="questions" className="s-sec">
        <div className="s-wrap">
          <div className="s-grid s-head s-rv">
            <h2 id="questions" className="s-h2">
              {t('faqTitle')}
            </h2>
            <p className="s-lead">{nb(t('faqLead'))}</p>
          </div>
          <dl className="s-qa">
            {faq.map((f) => (
              <div key={f.q} className="s-rv">
                <dt className="s-h3">{nb(f.q)}</dt>
                <dd className="s-body text-muted">{nb(f.a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <CtaBand
        title={t('ctaTitle')}
        text={t('ctaText', { count: TOOL_COUNT })}
        tone={1}
        mark={t('ctaAccent')}
      />
    </div>
  );
}
