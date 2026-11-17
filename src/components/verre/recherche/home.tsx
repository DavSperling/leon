'use client';

import { ArrowUp, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dismissBriefingLineAction, restoreBriefingLineAction } from '@/app/(app)/actions';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import {
  Button,
  CitationChip,
  GlassCard,
  IconButton,
  Kbd,
  Strokes,
  toast,
  toneOf,
  useModKey,
} from '@/components/verre';
import { HOME_TITLE_ID } from '@/components/verre/discussions/about-suggestion-card';
import { type PanelSource, useSourcePanel } from '@/components/verre/discussions/preview';
import { Logo } from '@/components/verre/shell/brand';
import { type BriefingLine, type BriefingSection, briefingFact } from '@/lib/briefing-view';
import { type DayPart, dayPart } from '@/lib/day-part';
import { DISCUSSION_MESSAGE_MAX_CHARS, type SourceVisibility } from '@/lib/discussion-events';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { cn, nb, useMinWidth } from '@/lib/verre';

// L'Accueil : le bonjour et le fait du jour, le champ où l'on demande, puis le point du matin quand la personne en a
// un (page.tsx pose à côté les questions à essayer et les discussions récentes).

const noSubscription = () => () => {};

/** Une source du point, à son numéro : de quoi ouvrir son original (son premier passage) dans le panneau. */
export type BriefingSourceView = {
  n: number;
  passageId: string | null;
  title: string | null;
  url: string | null;
  kind: string;
  visibility: SourceVisibility;
};

/**
 * Une ligne du point : sa phrase, puis ses numéros. Toute la ligne ouvre sa première source dans le panneau ; les
 * autres numéros restent des boutons. Pointée, le surligneur de cette source passe sous la phrase (.hl-pass, kit.css).
 * Les sources ne sont listées nulle part : l'infobulle de la ligne nomme la sienne.
 */
function Line({
  line,
  sources,
  open,
  fact,
  className,
}: {
  line: BriefingLine;
  sources: Map<number, BriefingSourceView>;
  open: (source: PanelSource) => void;
  /** Le fait du jour et sa ligne dans le point : pointer l'un trace le trait sous l'autre (group/home, page.tsx). */
  fact?: boolean;
  className?: string;
}) {
  const tv = useTranslations('discussionView');
  // une source sans passage à ouvrir garde son numéro, sans bouton
  const opens = line.refs.flatMap((n) => {
    const source = sources.get(n);
    return source?.passageId ? [{ ...source, passageId: source.passageId }] : [];
  });
  const first = opens[0];
  const label = (source: BriefingSourceView) =>
    nb(tv('sourceLabel', { number: source.n, title: source.title?.trim() || tv('untitled') }));
  // seuls les mots que la ligne a pris à la source sont marqués dans l'original
  const show = (source: PanelSource) => open({ ...source, used: [line.text] });
  // le dernier mot reste avec ses numéros : un numéro ne passe jamais seul à la ligne
  const cut = line.text.lastIndexOf(' ') + 1;
  // une ligne qui n'ouvre rien reste de l'encre : pas de trait à tracer
  const stroke = (edge: string) =>
    first && cn('hl', edge, fact && 'group-has-[[data-fact]:hover]/home:[--sweep:1]');
  return (
    <div
      data-fact={fact || undefined}
      className={cn(
        'relative -mx-3 rounded-item px-3 py-1.5 text-lead leading-[1.55] max-shell:py-2.5',
        first && `hl-pass hl-${toneOf(first.n)}`,
        className,
      )}
    >
      {first && (
        <button
          type="button"
          aria-label={label(first)}
          title={label(first)}
          onClick={() => show(first)}
          className="absolute inset-0 rounded-item"
        />
      )}
      <p className="max-w-[76ch] text-pretty">
        <span className={stroke('hl--a')}>{line.text.slice(0, cut)}</span>
        <span className="whitespace-nowrap">
          <span className={stroke('hl--b')}>{line.text.slice(cut)}</span>
          {line.refs.map((n) => {
            const source = opens.find((one) => one.n === n);
            return source && source !== first ? (
              <CitationChip
                key={n}
                n={n}
                label={label(source)}
                className="z-[1]"
                onClick={() => show(source)}
              />
            ) : (
              // le numéro de la source que la ligne ouvre : le bouton de la ligne le nomme, le clic le traverse
              <span
                key={n}
                aria-hidden={source ? true : undefined}
                className={cn('cite pointer-events-none', `c${toneOf(n)}`)}
              >
                {n}
              </span>
            );
          })}
        </span>
      </p>
    </div>
  );
}

const byNumber = (sources: BriefingSourceView[]) =>
  new Map(sources.map((source) => [source.n, source]));

/**
 * « Bonjour, Claire. » à l'heure de la personne : le serveur ne la connaît pas, le navigateur corrige au montage.
 * Dessous, le fait du jour quand le point en a un (briefingFact) : sa phrase, discrète, et son numéro.
 */
export function Greeting({
  name,
  serverPart,
  fact,
  sources = [],
  centered = false,
  brand = false,
  titleId = HOME_TITLE_ID,
}: {
  name: string | null;
  serverPart: DayPart;
  fact?: BriefingLine | null;
  sources?: BriefingSourceView[];
  centered?: boolean;
  brand?: boolean;
  titleId?: string;
}) {
  const t = useTranslations('welcome');
  const part = useSyncExternalStore(
    noSubscription,
    () => dayPart(new Date().getHours()),
    () => serverPart,
  );
  const panel = useSourcePanel();
  return (
    <header className={centered ? 'text-center' : undefined}>
      <h1
        id={titleId}
        tabIndex={-1}
        className={cn(
          'text-h1 font-semibold tracking-[-0.022em] text-balance text-fg outline-none max-sm:text-[26px]',
          centered && 'flex items-center justify-center gap-3',
        )}
      >
        {brand && <Logo className="size-8 max-sm:size-6" />}
        {name ? t(`greeting.${part}`, { name }) : t(`greetingAnon.${part}`)}
      </h1>
      {fact && (
        <>
          <Line
            line={fact}
            sources={byNumber(sources)}
            open={panel.open}
            fact
            // des mots discrets sur un trait de surligneur passeraient sous 4,5:1 : pointés, ils prennent l'encre
            className="mt-1 inline-block max-w-[calc(100%+24px)] align-top text-muted transition-colors duration-150 group-has-[[data-fact]:hover]/home:text-fg has-[:focus-visible]:text-fg"
          />
          {panel.panel}
        </>
      )}
    </header>
  );
}

/**
 * Le champ où l'on demande, dans la page : la barre du haut n'est pas montrée sur l'Accueil, et ⌘K met le curseur
 * ici (app-shell.tsx). La question ouvre une discussion, où Leon répond tout de suite ; sans modèle branché, c'est
 * une recherche (`/?q=`), qui marche sans lui.
 */
export function HomeAsk({ canAsk }: { canAsk: boolean }) {
  const t = useTranslations('welcome');
  const shell = useTranslations('shell');
  const d = useTranslations('discussions');
  const s = useTranslations('search');
  const modKey = useModKey();
  const [state, action, pending] = useActionState<NewDiscussionState, FormData>(
    newDiscussionAction,
    { error: null },
  );
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const roomy = useMinWidth(form, 480); // champ étroit : un indicatif court, jamais coupé au milieu d'un mot
  const label = canAsk ? t('ask') : s('searchEverything');

  // Sur un ordinateur, le curseur est déjà dans le champ ; au doigt, le clavier ne s'ouvre pas tout seul.
  useEffect(() => {
    if (window.matchMedia('(min-width: 861px) and (hover: hover)').matches)
      input.current?.focus({ preventScroll: true });
  }, []);

  return (
    <search aria-label={label} className="mt-6 block">
      <form
        ref={form}
        action={canAsk ? action : '/'}
        // rien d'écrit : « Demander » mène au champ, sans message du navigateur
        onSubmit={(event) => {
          if (input.current?.value.trim() !== '') return;
          event.preventDefault();
          input.current?.focus();
        }}
        // un clic sur la feuille, à côté des mots, met le curseur dans le champ
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('input, button')) return;
          event.preventDefault();
          input.current?.focus();
        }}
        className="group flex h-[60px] cursor-text items-center gap-3.5 rounded-card border border-line bg-sheet pr-3 pl-5 shadow-lift transition-[border-color] duration-150 hover:border-line-strong has-[input:focus-visible]:border-fg has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-1 has-[input:focus-visible]:outline-fg max-shell:h-14 max-shell:gap-3 max-shell:pr-1.5 max-shell:pl-4"
      >
        <Strokes className="strokes--draw" />
        <label htmlFor="demander-accueil" className="sr-only">
          {label}
        </label>
        <input
          ref={input}
          id="demander-accueil"
          // le champ de l'écran : ⌘K y vient (app-shell.tsx)
          data-ask=""
          name={canAsk ? 'question' : 'q'}
          type="text"
          maxLength={canAsk ? DISCUSSION_MESSAGE_MAX_CHARS : QUERY_MAX_CHARS}
          placeholder={roomy ? `${label}…` : canAsk ? shell('askOrSearch') : s('placeholder')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          // et non disabled : le focus reste dans le champ pendant l'envoi
          readOnly={pending}
          aria-busy={pending || undefined}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'demander-accueil-note' : undefined}
          aria-keyshortcuts="Meta+K Control+K"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ellipsis text-fg outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <span
          aria-hidden="true"
          className="inline-flex gap-1 transition-opacity duration-150 group-focus-within:opacity-0 max-shell:hidden"
        >
          <Kbd>{modKey.trim()}</Kbd>
          <Kbd>K</Kbd>
        </span>
        <Button type="submit" variant="primary" loading={pending}>
          {canAsk ? d('ask') : s('submit')}
          <ArrowUp aria-hidden="true" strokeWidth={1.8} />
        </Button>
      </form>
      {state.error && (
        <p id="demander-accueil-note" role="alert" className="mt-2 ml-5 text-ui text-destructive">
          {nb(state.error)}
        </p>
      )}
    </search>
  );
}

// Les titres que le point écrit en anglais (BRIEFING_SECTIONS), dans la langue de l'écran ; un autre reste tel quel.
const SECTION_KEYS: Record<string, 'did' | 'changed' | 'open'> = {
  'What you did': 'did',
  'What changed': 'changed',
  'What is still open': 'open',
};

// Le temps d'« Annuler » après « C'est réglé », avant que la ligne ne parte pour de bon de la page.
const UNDO_MS = 6000;

/**
 * Le point du matin : la feuille de l'écran. Ses trois parties l'une sous l'autre, leur titre dans la marge dès que
 * la feuille est assez large ; chaque ligne finit par ses numéros et ouvre sa source. En 15 px : de vraies phrases.
 * Une croix au bout de chaque ligne (au pointeur, toujours visible au doigt) la retire : « c'est réglé ». La base le
 * garde tout de suite (0074) ; la ligne laisse sur place « Ligne retirée · Annuler » quelques secondes, puis s'en va.
 */
export function BriefingSheet({
  project,
  sections,
  sources,
}: {
  project: string;
  sections: BriefingSection[];
  sources: BriefingSourceView[];
}) {
  const t = useTranslations('welcome');
  const router = useRouter();
  const panel = useSourcePanel();
  const byN = byNumber(sources);
  const fact = briefingFact(sections);
  // les lignes retirées sur cette page, par leur texte : « undo » le temps d'annuler, puis « gone »
  const [removed, setRemoved] = useState<ReadonlyMap<string, 'undo' | 'gone'>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const mark = (text: string, state: 'undo' | 'gone' | null) =>
    setRemoved((current) => {
      const next = new Map(current);
      if (state) next.set(text, state);
      else next.delete(text);
      return next;
    });
  const leave = (text: string) => {
    timers.current.delete(text);
    // le focus était sur « Annuler », qui s'en va : il revient au titre de l'Accueil, jamais sur <body>
    if (document.activeElement?.closest('[data-undo]'))
      document.getElementById(HOME_TITLE_ID)?.focus();
    mark(text, 'gone');
    // le fait du jour sous le bonjour, ou le point entier vidé, suivent : le serveur relit le point sans cette ligne
    router.refresh();
  };
  const dismiss = async (text: string) => {
    mark(text, 'undo');
    if (!(await dismissBriefingLineAction(project, text))) {
      mark(text, null);
      toast.error(t('briefing.dismissFailed'));
      return;
    }
    timers.current.set(
      text,
      setTimeout(() => leave(text), UNDO_MS),
    );
  };
  const undo = async (text: string) => {
    clearTimeout(timers.current.get(text));
    timers.current.delete(text);
    mark(text, null);
    if (!(await restoreBriefingLineAction(project, text))) {
      mark(text, 'gone');
      toast.error(t('briefing.undoFailed'));
    }
  };

  return (
    <>
      <GlassCard className="@container px-6 py-1 max-shell:px-4">
        {/* une seule colonne de titres pour les trois parties, à la largeur du plus long (le français l'est plus) */}
        <div className="grid gap-x-6 @[32.5rem]:grid-cols-[auto_minmax(0,1fr)]">
          {sections.map((section) => {
            const key = SECTION_KEYS[section.title];
            const lines = section.lines.filter((line) => removed.get(line.text) !== 'gone');
            if (lines.length === 0) return null;
            return (
              <section
                key={section.title}
                className="col-span-full grid grid-cols-subgrid border-line py-2.5 [&+&]:border-t"
              >
                <h3 className="min-w-[132px] pt-2 pb-0.5 text-title font-semibold text-fg">
                  {key ? t(`briefing.${key}`) : section.title}
                </h3>
                <ul className="min-w-0">
                  {lines.map((line, index) =>
                    removed.get(line.text) === 'undo' ? (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: lignes fixes, jamais réordonnées ; deux lignes identiques ne se confondent pas
                        key={`${index}-${line.text}`}
                        data-undo=""
                        className="flex min-h-[38px] items-center gap-2 py-1 text-ui text-muted"
                      >
                        <span role="status">{t('briefing.dismissed')}</span>
                        <Button
                          size="xs"
                          variant="quiet"
                          // « Annuler » prend la place de la croix : le focus du clavier y passe
                          autoFocus
                          onClick={() => undo(line.text)}
                        >
                          {t('briefing.undo')}
                        </Button>
                      </li>
                    ) : (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: lignes fixes, jamais réordonnées ; deux lignes identiques ne se confondent pas
                        key={`${index}-${line.text}`}
                        className="group/line relative"
                      >
                        <Line
                          line={line}
                          sources={byN}
                          open={panel.open}
                          fact={line === fact}
                          className="pr-11"
                        />
                        <IconButton
                          icon={X}
                          label={t('briefing.dismiss')}
                          onClick={() => dismiss(line.text)}
                          // au pointeur : visible quand on pointe la ligne ou qu'on y arrive au clavier ; au doigt : toujours
                          className="absolute top-0.5 right-0 z-[2] opacity-0 transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100 max-shell:top-0 [@media(hover:none)]:opacity-100"
                        />
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </GlassCard>
      {panel.panel}
    </>
  );
}
