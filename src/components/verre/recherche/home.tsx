'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { CitationChip, GlassCard, SourceNumber, ToolLogo } from '@/components/verre';
import { HOME_TITLE_ID } from '@/components/verre/discussions/about-suggestion-card';
import { useSourcePanel } from '@/components/verre/discussions/preview';
import type { BriefingSection } from '@/lib/briefing-view';
import { type DayPart, dayPart } from '@/lib/day-part';
import type { SourceVisibility } from '@/lib/discussion-events';
import { cn, nb } from '@/lib/verre';

// L'Accueil : le bonjour, le point du matin quand la personne en a un, et les questions à essayer (page.tsx).

const noSubscription = () => () => {};

// Le trait sous le prénom suit l'heure : ambre le matin, vert l'après-midi, rose le soir.
const PART_STROKE: Record<DayPart, string> = {
  morning: 'hl-4',
  afternoon: 'hl-2',
  evening: 'hl-1',
};

/** « Bonjour, Claire. » à l'heure de la personne : le serveur ne la connaît pas, le navigateur corrige au montage.
 *  Le seul titre de l'appli à la taille d'une une, et le seul trait de surligneur de l'écran : sous le prénom. */
export function Greeting({ name, serverPart }: { name: string | null; serverPart: DayPart }) {
  const t = useTranslations('welcome');
  const part = useSyncExternalStore(
    noSubscription,
    () => dayPart(new Date().getHours()),
    () => serverPart,
  );
  const text = name ? t(`greeting.${part}`, { name }) : t(`greetingAnon.${part}`);
  const at = name ? text.indexOf(name) : -1;
  return (
    <h1
      id={HOME_TITLE_ID}
      tabIndex={-1}
      className="isolate text-h1 font-semibold tracking-[-0.02em] text-fg outline-none shell:text-[40px] shell:leading-[48px] shell:tracking-[-0.03em]"
    >
      {name && at !== -1 ? (
        <>
          {text.slice(0, at)}
          {/* un trait de surligneur passé à la main sous le prénom : dans le bas des lettres, un peu de travers */}
          <span
            className={cn(
              'relative whitespace-nowrap before:absolute before:-inset-x-[0.07em] before:bottom-[0.1em] before:-z-10 before:h-[0.4em] before:-rotate-1 before:rounded-mark before:bg-[var(--hl)]',
              PART_STROKE[part],
            )}
          >
            {name}
          </span>
          {text.slice(at + name.length)}
        </>
      ) : (
        text
      )}
    </h1>
  );
}

/** Une source du point, à son numéro : de quoi ouvrir son original (son premier passage) dans le panneau. */
export type BriefingSourceView = {
  n: number;
  passageId: string | null;
  title: string | null;
  url: string | null;
  kind: string;
  visibility: SourceVisibility;
};

// Les titres que le point écrit en anglais (BRIEFING_SECTIONS), dans la langue de l'écran ; un autre reste tel quel.
const SECTION_KEYS: Record<string, 'did' | 'changed' | 'open'> = {
  'What you did': 'did',
  'What changed': 'changed',
  'What is still open': 'open',
};

/** Le point du matin : un document posé sur la pile. Ses trois parties l'une sous l'autre, leur titre dans la marge ;
 *  chaque ligne dit d'où elle vient (le logo de sa première source) et finit par ses numéros. Toute la ligne ouvre sa
 *  première source ; les autres numéros restent des boutons. En 15 px : de vraies phrases, pas un mur en 18 px. */
export function BriefingSheet({
  sections,
  sources,
}: {
  sections: BriefingSection[];
  sources: BriefingSourceView[];
}) {
  const t = useTranslations('welcome');
  const tv = useTranslations('discussionView');
  const panel = useSourcePanel();
  const byN = new Map(sources.map((source) => [source.n, source]));
  return (
    <div className="relative">
      {/* la pile : le bord des feuilles d'en dessous */}
      <i
        aria-hidden="true"
        className="absolute inset-x-6 -bottom-3 h-6 rounded-card border border-line bg-sheet"
      />
      <i
        aria-hidden="true"
        className="absolute inset-x-3 -bottom-1.5 h-6 rounded-card border border-line bg-sheet"
      />
      <GlassCard className="@container relative px-6 py-1 max-shell:px-4">
        {sections.map((section) => {
          const key = SECTION_KEYS[section.title];
          return (
            <section
              key={section.title}
              className="grid gap-x-6 border-line py-3 [&+&]:border-t @[44rem]:grid-cols-[132px_minmax(0,1fr)]"
            >
              <h3 className="pt-2 pb-1 text-title font-semibold text-fg">
                {key ? t(`briefing.${key}`) : section.title}
              </h3>
              <ul className="-mx-3 min-w-0">
                {section.lines.map((line, index) => {
                  const first = line.refs.map((n) => byN.get(n)).find((source) => source);
                  let stretched = false;
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: lignes fixes, jamais réordonnées ; deux lignes identiques ne se confondent pas
                      key={`${index}-${line.text}`}
                      className="relative grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-item px-3 py-2 transition-colors duration-150 has-[button]:hover:bg-hover has-[button:active]:bg-n-150"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[3px] grid size-[18px] place-items-center"
                      >
                        {first ? (
                          <ToolLogo kind={first.kind} size={18} />
                        ) : (
                          <i className="size-1 rounded-full bg-icon" />
                        )}
                      </span>
                      <p className="max-w-[76ch] text-lead leading-[1.55] text-pretty text-fg">
                        {line.text}
                      </p>
                      <span className="flex items-center gap-1 pt-0.5">
                        {line.refs.map((n) => {
                          const source = byN.get(n);
                          const passageId = source?.passageId;
                          // un numéro sans source visible, ou sans passage à ouvrir, reste une étiquette
                          if (!source || !passageId) return <SourceNumber key={n} n={n} />;
                          // le premier numéro qui s'ouvre prend toute la ligne ; les suivants passent devant
                          const whole = !stretched;
                          stretched = true;
                          return (
                            <CitationChip
                              key={n}
                              n={n}
                              label={nb(
                                tv('sourceLabel', {
                                  number: n,
                                  title: source.title?.trim() || tv('untitled'),
                                }),
                              )}
                              className={cn(
                                'top-0 m-0',
                                whole
                                  ? 'static after:inset-0 after:rounded-item'
                                  : 'relative z-[1]',
                              )}
                              onClick={() =>
                                // seuls les mots que la ligne a pris à la source sont marqués dans l'original
                                panel.open({ ...source, passageId, used: [line.text] })
                              }
                            />
                          );
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </GlassCard>
      {panel.panel}
    </div>
  );
}
