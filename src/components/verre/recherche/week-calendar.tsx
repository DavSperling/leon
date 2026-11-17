'use client';

import { ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { RendezVous } from '@/lib/agenda';
import { cn } from '@/lib/verre/cn';
import { Button, GlassCard, Section, SidePanel, SourceChip } from '../ui';

// Le calendrier de la semaine sur l'Accueil : une bande de sept jours (un point sous ceux qui ont un rendez-vous) et
// les prochains rendez-vous ; un clic ouvre le panneau, avec le détail de chacun et le lien vers sa source. Tout est à
// l'heure de Paris, calculé par le serveur (src/lib/agenda.ts) : rien ne dépend du fuseau du navigateur.

// Les prochains rendez-vous montrés sur la carte ; les autres sont dans le panneau.
const NEXT_MAX = 3;

const dayFormat = (locale: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { timeZone: 'UTC', ...options });
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const hourOf = (time: string | null) => (time && time.length > 10 ? time.slice(11, 16) : null);

export function WeekCalendar({
  days,
  rendezVous,
  now,
}: {
  days: string[];
  rendezVous: RendezVous[];
  /** L'heure de Paris : « 2026-11-17T14:05 ». */
  now: string;
}) {
  const t = useTranslations('welcome.agenda');
  const locale = useLocale();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const today = now.slice(0, 10);
  const byDay = new Map(
    days.map((day) => [day, rendezVous.filter((r) => r.debut.startsWith(day))]),
  );
  const isPast = (r: RendezVous) => (r.fin ?? r.debut) < (hourOf(r.debut) ? now : today);
  const next = rendezVous.filter((r) => !isPast(r)).slice(0, NEXT_MAX);
  const letter = dayFormat(locale, { weekday: 'narrow' });
  const short = dayFormat(locale, { weekday: 'short' });
  const long = dayFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;

  return (
    <Section
      id="semaine"
      title={t('title')}
      actions={
        <Button variant="link" onClick={() => setOpenDay(today)}>
          {t('open')}
        </Button>
      }
      className="mt-0"
    >
      <GlassCard className="px-3 pt-2 pb-1.5">
        <ol className="grid grid-cols-7">
          {days.map((day) => {
            const count = byDay.get(day)?.length ?? 0;
            const isToday = day === today;
            return (
              <li key={day}>
                <button
                  type="button"
                  onClick={() => setOpenDay(day)}
                  aria-label={t('dayLabel', { day: long.format(asDate(day)), count })}
                  className="group/day flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-item transition-colors duration-150 hover:bg-hover active:bg-n-150"
                >
                  <span className={cn('text-label', day < today ? 'text-muted' : 'text-fg-2')}>
                    {letter.format(asDate(day))}
                  </span>
                  <span
                    className={cn(
                      'grid size-7 place-items-center rounded-full text-ui tabular-nums',
                      isToday
                        ? 'bg-ink font-semibold text-on-ink'
                        : day < today
                          ? 'text-muted'
                          : 'text-fg',
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1 rounded-full',
                      count > 0 ? 'bg-accent' : 'bg-transparent',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-1.5 border-line border-t pt-1">
          {next.length === 0 ? (
            <p className="px-2 py-2.5 text-ui text-muted">
              {rendezVous.length === 0 ? t('emptyWeek') : t('restOfWeek')}
            </p>
          ) : (
            <ul>
              {next.map((r) => (
                <li key={`${r.sourceId}-${r.debut}-${r.titre}`}>
                  <button
                    type="button"
                    onClick={() => setOpenDay(r.debut.slice(0, 10))}
                    className="flex min-h-11 w-full items-center gap-3 rounded-item px-2 py-1.5 text-left text-ui transition-colors duration-150 hover:bg-hover active:bg-n-150"
                  >
                    <span className="w-[5.25rem] shrink-0 whitespace-nowrap text-label text-muted tabular-nums first-letter:uppercase">
                      {r.debut.startsWith(today)
                        ? t('today')
                        : short.format(asDate(r.debut.slice(0, 10)))}{' '}
                      {hourOf(r.debut) ?? ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.titre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassCard>

      <SidePanel
        open={openDay !== null}
        onOpenChange={(open) => !open && setOpenDay(null)}
        title={t('title')}
        sub={dayFormat(locale, { day: 'numeric', month: 'long' }).formatRange(
          asDate(first),
          asDate(last),
        )}
      >
        <div className="grid gap-6">
          {days.map((day) => {
            const items = byDay.get(day) ?? [];
            return (
              <section key={day} aria-labelledby={`jour-${day}`}>
                <h3
                  id={`jour-${day}`}
                  tabIndex={-1}
                  {...(day === openDay ? { 'data-autofocus': '' } : {})}
                  className={cn(
                    'scroll-mt-2 rounded-item text-lead font-semibold first-letter:uppercase outline-none',
                    day < today ? 'text-muted' : 'text-fg',
                  )}
                >
                  {long.format(asDate(day))}
                  {day === today && (
                    <span className="ml-2 text-label font-normal text-muted">{t('today')}</span>
                  )}
                </h3>
                {items.length === 0 ? (
                  <p className="mt-1 text-ui text-muted">{t('nothing')}</p>
                ) : (
                  <ul className="mt-2">
                    {items.map((r) => (
                      <li
                        key={`${r.sourceId}-${r.debut}-${r.titre}`}
                        className={cn(
                          'grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 border-line py-2.5 [&+&]:border-t',
                          isPast(r) && 'opacity-60',
                        )}
                      >
                        <span className="whitespace-nowrap pt-px text-ui text-fg-2 tabular-nums">
                          {hourOf(r.debut)
                            ? [hourOf(r.debut), hourOf(r.fin)].filter(Boolean).join('–')
                            : t('allDay')}
                        </span>
                        <div className="min-w-0">
                          <p className="text-ui font-medium text-fg [overflow-wrap:anywhere]">
                            {r.titre}
                          </p>
                          {r.avec && (
                            <p className="mt-0.5 text-label text-muted [overflow-wrap:anywhere]">
                              {t('with', { names: r.avec })}
                            </p>
                          )}
                          {r.lien ? (
                            <a
                              href={r.lien}
                              target="_blank"
                              rel="noreferrer"
                              className="-mx-1 mt-1.5 inline-flex max-w-full items-center gap-1 rounded-item px-1 py-0.5 transition-colors duration-150 hover:bg-hover"
                            >
                              <SourceChip kind={r.outil} />
                              <ArrowUpRight
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-muted"
                              />
                              <span className="sr-only">{t('newTab')}</span>
                            </a>
                          ) : (
                            <SourceChip kind={r.outil} className="mt-1.5" />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </SidePanel>
    </Section>
  );
}
