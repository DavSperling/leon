import { useTranslations } from 'next-intl';
import type { ProviderId } from '@/capture/turn';
import { nb } from '@/lib/verre/nb';
import { useSiteContent } from '../content';
import { CtaBand, order, ToolLogo } from '../parts';
import { FactList, PageHero } from './page-hero';

// Page « Sécurité » : la promesse (Leon voit ce que vous avez le droit de voir), les deux règles de visibilité en deux
// feuilles sur le bureau, ce qui est en place (du code en production : une feuille à l'encre), ce qui est en cours (dit
// franchement, sur la bande d'encre, ancre #pas-encore : la même feuille, encore au crayon), puis « vérifiez par vous-même ». Aucun formulaire : rien ne le recevrait.

const RULES = [
  {
    id: 'team',
    rows: [
      { key: 'teamRows.docs', tools: ['linear', 'notion', 'jira'] },
      { key: 'teamRows.meetings', tools: ['granola', 'hubspot'] },
      { key: 'teamRows.support', tools: ['intercom', 'front'] },
    ],
  },
  {
    id: 'you',
    rows: [
      { key: 'youRows.mail', tools: ['gmail', 'drive', 'slack'] },
      { key: 'youRows.ai', tools: [] },
      { key: 'youRows.chats', tools: [] },
    ],
  },
] as const satisfies readonly {
  id: string;
  rows: readonly { key: string; tools: readonly ProviderId[] }[];
}[];

export function SecuritePage() {
  const t = useTranslations('site.security');
  const demo = useTranslations('site.demo');
  const { securityFacts, notYet } = useSiteContent();
  return (
    <div className="s-page">
      <PageHero title={t('heroTitle')} accent={t('heroAccent')} tone={3} lead={t('heroLead')} />

      <section aria-labelledby="regles" className="s-stage pg-desk">
        <div className="s-wrap">
          <div className="s-grid s-head s-rv">
            <h2 id="regles" className="s-h2">
              {t('whoTitle')}
            </h2>
            <p className="s-lead">{nb(t('whoLead'))}</p>
          </div>
          <div className="s-grid mt-12 gap-y-6">
            {RULES.map((rule, i) => (
              <article
                key={rule.id}
                aria-labelledby={`regle-${rule.id}`}
                className={`s-rule s-sheet pg-pile pg-land${i === 0 ? ' pg-land--left' : ''}`}
                style={order(i)}
              >
                <h3 id={`regle-${rule.id}`} className="s-h3">
                  {t(`${rule.id}Title`)}
                </h3>
                <p className="s-body mt-1.5 text-muted">{nb(t(`${rule.id}Text`))}</p>
                <ul className="s-rule__rows">
                  {rule.rows.map((r) => (
                    <li key={r.key}>
                      <span>{nb(t(r.key))}</span>
                      {r.tools.length > 0 && (
                        <span className="s-logos">
                          {r.tools.map((id) => (
                            <ToolLogo key={id} id={id} size={22} title />
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="s-rule__foot s-small">
                  {t('onSource')}
                  {rule.id === 'you' ? (
                    <span className="s-stamp pg-stamp text-fg">{demo('private')}</span>
                  ) : (
                    <span className="font-medium text-fg">{demo('shared')}</span>
                  )}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="en-place" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="en-place" className="s-h2">
              {t('factsTitle')}
            </h2>
            <p className="s-lead mt-5">{nb(t('factsLead'))}</p>
          </div>
          <FactList items={securityFacts} className="s-split__body s-sheet pg-inked" />
        </div>
      </section>

      <section id="pas-encore" aria-labelledby="en-cours" className="s-band s-ink">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="en-cours" className="s-h2">
              {t('notYetTitle')}
            </h2>
            <p className="s-lead mt-5 text-[var(--s-on-band-2)]">{nb(t('notYetLead'))}</p>
          </div>
          <FactList items={notYet} progress className="s-split__body pg-inked pg-inked--draft" />
        </div>
      </section>

      <CtaBand title={t('ctaTitle')} mark={t('ctaAccent')} tone={3} text={t('ctaText')} />
    </div>
  );
}
