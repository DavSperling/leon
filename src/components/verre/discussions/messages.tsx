'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  CitationChip,
  CitedMarkdown,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CopyButton,
  Flag,
  GlassCard,
  Reading,
  SourceNumber,
  Thing,
  ThingGrid,
  ToolLogo,
  toneOf,
} from '@/components/verre';
import { type CitationView, replyParts } from '@/lib/discussion-events';
import { SOURCE_KIND_LABELS } from '@/lib/labels';
import { citingSentences, markCited, stripMarks } from '@/lib/source-marks';
import { cn, nb } from '@/lib/verre';
import { stackNotes } from './note-places';
import type { PanelSource } from './preview';
import './fil.css';

// Un message du fil : ce que la personne a écrit, à droite ; la réponse de Leon, à gauche, sur sa feuille, avec ses
// sources au pied de la feuille, comme les notes d'une page. Seuls les mots qui viennent d'une source sont sous le surligneur, dans sa couleur
// (lib/source-marks.ts). Un numéro ou une tuile ouvre l'original dans le panneau. Le texte vient du modèle : jamais lu
// comme du HTML.

export type OpenSource = (source: PanelSource) => void;

const titleOf = (citation: CitationView, fallback: string): string =>
  citation.title?.trim() || fallback;

const toolOf = (kind: string | undefined): string | null =>
  kind && Object.hasOwn(SOURCE_KIND_LABELS, kind)
    ? SOURCE_KIND_LABELS[kind as keyof typeof SOURCE_KIND_LABELS]
    : null;

export const panelSource = (citation: CitationView): PanelSource => ({
  n: citation.n,
  passageId: citation.passageId,
  title: citation.title,
  url: citation.url,
  kind: citation.kind,
  visibility: citation.visibility,
  passage: citation.passage,
});

/** Les résultats d'où part une discussion : une tuile par source, sur le bureau, aux deux colonnes du fil. */
function SourceTiles({
  citations,
  onOpen,
  className,
}: {
  citations: CitationView[];
  onOpen: OpenSource;
  className?: string;
}) {
  const t = useTranslations('discussionView');
  return (
    <ThingGrid cols={3} className={cn('grid-cols-2 max-sm:grid-cols-1', className)}>
      {citations.map((c) => (
        <Thing
          key={c.n}
          num={c.n}
          // l'outil et « Vous seul » seulement quand le serveur les connaît (citationDetails, sous les droits du lecteur)
          picture={c.kind ? <ToolLogo kind={c.kind} size={28} /> : undefined}
          name={titleOf(c, t('untitled'))}
          caption={c.visibility === 'moi' ? t('visibility.moi') : undefined}
          label={nb(t('sourceLabel', { number: c.n, title: titleOf(c, t('untitled')) }))}
          onClick={() => onOpen(panelSource(c))}
        />
      ))}
    </ThingGrid>
  );
}

/**
 * Les sources d'une réponse : ses notes. Dans une fenêtre large, chacune sort du bord droit de la feuille sous son
 * drapeau, à la hauteur de la phrase qu'elle appuie (fil.css, `usePlacedNotes`) ; sinon elles restent au pied de la
 * feuille, comme les notes d'une page. Une note ouvre l'original ; pointée, elle appuie ses mots dans le texte (`onLit`).
 */
function SourceNotes({
  citations,
  lit,
  fresh,
  onLit,
  onOpen,
}: {
  citations: CitationView[];
  lit: number | null;
  fresh?: boolean;
  onLit: (n: number | null) => void;
  onOpen: OpenSource;
}) {
  const t = useTranslations('discussionView');
  return (
    <ol className="fil-notes" data-fresh={fresh || undefined}>
      {citations.map((c) => (
        <li key={c.n} data-n={c.n}>
          <button
            type="button"
            aria-label={nb(t('sourceLabel', { number: c.n, title: titleOf(c, t('untitled')) }))}
            title={titleOf(c, t('untitled'))}
            data-lit={lit === c.n || undefined}
            onClick={() => onOpen(panelSource(c))}
            onPointerEnter={() => onLit(c.n)}
            onPointerLeave={() => onLit(null)}
            onFocus={() => onLit(c.n)}
            onBlur={() => onLit(null)}
            // sa couleur (cN) : celle de son drapeau, et de la toile qui le suit quand on le tire
            className={`fil-note group/src c${toneOf(c.n)}`}
          >
            <Flag tone={toneOf(c.n)} className="fil-note__flag" aria-hidden="true">
              {c.n}
            </Flag>
            <SourceNumber n={c.n} className="fil-note__num" />
            {/* l'outil et « Vous seul » seulement quand le serveur les connaît (citationDetails) */}
            {c.kind && <ToolLogo kind={c.kind} size={20} className="fil-note__logo" />}
            <span className="fil-note__title">{titleOf(c, t('untitled'))}</span>
            {c.visibility === 'moi' && <span className="fil-note__cap">{t('visibility.moi')}</span>}
            <ChevronRight
              aria-hidden="true"
              strokeWidth={1.8}
              className="fil-note__go size-4 shrink-0 text-fg opacity-0 transition-[translate,opacity] duration-150 group-hover/src:translate-x-0.5 group-hover/src:opacity-100 group-focus-visible/src:opacity-100 max-shell:hidden"
            />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * Dans la marge, chaque note se place à la hauteur du premier renvoi à sa source ; deux notes qui se toucheraient
 * se suivent. Une source sans renvoi dans le texte vient après les autres. Au pied de la feuille, rien à placer.
 */
function usePlacedNotes(sheet: RefObject<HTMLDivElement | null>, key: string) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` dit quand le texte ou ses sources ont changé
  useLayoutEffect(() => {
    const el = sheet.current;
    const list = el?.querySelector<HTMLElement>('.fil-notes');
    if (!el || !list) return;
    const place = () => {
      if (getComputedStyle(list).position !== 'absolute') {
        delete list.dataset.placed;
        el.style.removeProperty('--notes-min');
        return;
      }
      // la page est arrivée avec ses notes l'une sous l'autre : à leur première mise en place, elles glissent jusqu'à
      // leur phrase (rien ne saute) ; une réponse qui vient d'arriver pose les siennes elle-même (fil.css)
      const glide =
        list.dataset.placed === undefined &&
        list.dataset.fresh === undefined &&
        document.documentElement.dataset.motion !== 'off' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const was = new Map(
        glide ? ([...list.children] as HTMLElement[]).map((note) => [note, note.offsetTop]) : [],
      );
      const top = el.getBoundingClientRect().top + el.clientTop;
      const notes = ([...list.children] as HTMLElement[])
        .map((note) => {
          const chip = el.querySelector(`[data-cite="${note.dataset.n}"]`)?.getBoundingClientRect();
          // le drapeau (22 px) à mi-hauteur du numéro (19 px)
          return { note, y: chip ? chip.top - top - 2 : Infinity, x: chip?.left ?? 0 };
        })
        // dans l'ordre du texte : de haut en bas, et sur une même ligne de gauche à droite
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const tops = stackNotes(
        notes.map(({ note, y }) => ({ y, height: note.offsetHeight })),
        24,
        10,
      );
      let end = 0;
      notes.forEach(({ note }, i) => {
        const at = tops[i] as number;
        note.style.setProperty('--y', `${at}px`);
        note.style.setProperty('--i', String(i));
        end = at + note.offsetHeight;
        const from = was.get(note);
        if (from !== undefined && from !== at)
          note.animate([{ translate: `0 ${from - at}px` }, { translate: '0 0' }], {
            duration: 220,
            easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          });
      });
      list.dataset.placed = '';
      // la feuille descend au moins jusqu'au pied de la dernière note (ses deux traits compris)
      el.style.setProperty('--notes-min', `${end + 8}px`);
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    return () => watch.disconnect();
  }, [sheet, key]);
}

export function UserBubble({
  content,
  seeds,
  onOpen,
}: {
  content: string;
  // Les résultats de la recherche d'où part la discussion (sur sa première question seulement).
  seeds: CitationView[];
  onOpen: OpenSource;
}) {
  const t = useTranslations('discussionView');
  return (
    <div className="grid justify-items-end gap-2">
      {/* un mot posé à droite du fil : son coin bas à droite reste vif, du côté de qui parle */}
      <div className="w-fit max-w-[min(86%,560px)] rounded-card rounded-br-[4px] bg-n-150 px-5 py-3">
        <p className="sr-only">{t('you')}</p>
        {/* la question se lit à la taille de la réponse : c'est la moitié de la conversation, pas une étiquette */}
        <p className="text-answer break-words whitespace-pre-wrap text-fg">{content}</p>
      </div>
      {seeds.length > 0 && (
        // les résultats d'origine sont secondaires : repliés, ouverts à la demande
        <Collapsible className="w-full">
          <div className="flex justify-end">
            <CollapsibleTrigger className="group -mr-2 inline-flex min-h-8 items-center gap-1 rounded-item px-2 text-label font-medium text-muted transition-colors hover:bg-hover hover:text-fg max-shell:min-h-11">
              {t('searchSeeds')}
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-[rotate] duration-150 group-data-[state=open]:rotate-180"
                strokeWidth={1.8}
              />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <SourceTiles citations={seeds} onOpen={onOpen} className="mt-2" />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Réponse en cours : ce que Leon fait (avant son premier mot), puis le texte reçu. */
export type Live = { activity: string | null; text: string };

type LeonCardProps = {
  content: string;
  citations: CitationView[];
  /** Réponse en cours. */
  live?: Live;
  /** Réponse qui vient d'arriver : ses traits sont tracés une fois. */
  fresh?: boolean;
  onOpen: OpenSource;
};

/** Le texte copié : la réponse avec ses renvois, puis la liste des sources (« [1] Notion · Titre · adresse »). */
function copyText(main: string, citations: CitationView[], untitled: string): string {
  const sources = citations.map((c) =>
    [`[${c.n}]`, [toolOf(c.kind), titleOf(c, untitled), c.url].filter(Boolean).join(' · ')].join(
      ' ',
    ),
  );
  return [main.trim(), sources.join('\n')].filter(Boolean).join('\n\n');
}

// La feuille d'une réponse : une page au format du fil, ses marges, son texte.
const SHEET = 'px-8 pt-7 pb-6 max-shell:px-5 max-shell:py-5';

export function LeonCard({ content, citations, live, fresh, onOpen }: LeonCardProps) {
  const t = useTranslations('discussionView');
  // la source pointée (son numéro dans le texte, sa ligne au pied de la feuille) : ses mots s'appuient
  const [lit, setLit] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  usePlacedNotes(
    sheet,
    `${content}|${citations.map((c) => `${c.n}${c.kind ?? ''}${c.title ?? ''}`).join()}`,
  );
  const byN = new Map(citations.map((c) => [c.n, c]));
  // Une phrase fixe (refus, rien trouvé) s'affiche traduite ; une limite atteinte, à part, en note.
  const reply = replyParts(content);
  const main = reply.fixed ? t(reply.fixed) : reply.main;

  if (live)
    return (
      <GlassCard aria-busy="true" className={SHEET}>
        <p className="sr-only">Leon</p>
        {live.text === '' ? (
          // avant le premier évènement, rien d'inventé : seulement « Leon travaille »
          <Reading>{live.activity ?? t('activity.autre')}</Reading>
        ) : (
          <div className="answer break-words text-fg">
            {/* Les renvois [n] restent du texte jusqu'à la fin : leurs sources arrivent avec elle. */}
            <CitedMarkdown
              text={live.text}
              renderCite={(n) => `[${n}]`}
              tail={<span className="caret" aria-hidden="true" />}
            />
          </div>
        )}
      </GlassCard>
    );

  // le panneau marque les mots que la réponse a pris à la source, comme la réponse elle-même
  const open = (c: CitationView) =>
    onOpen({ ...panelSource(c), used: main ? citingSentences(main, c.n) : undefined });
  return (
    <div>
      {/* une feuille, mais pas découpée à son bord : ses drapeaux en sortent */}
      <div
        ref={sheet}
        className={cn(
          'fil-sheet relative rounded-card border border-line bg-sheet shadow-sheet',
          SHEET,
        )}
      >
        <div
          className={cn(
            'answer break-words',
            reply.fixed ? 'text-muted' : 'text-fg',
            fresh && 'hl-arrive',
          )}
        >
          <p className="sr-only">Leon</p>
          {main && (
            <CitedMarkdown
              text={main}
              keep={(n) => byN.has(n)}
              lit={lit}
              // seuls les mots qui viennent de la source, dans sa couleur ; rien de partagé : le numéro seul
              mark={
                reply.fixed
                  ? undefined
                  : (text) =>
                      markCited(
                        text,
                        (n) => byN.get(n)?.passage,
                        (n) => byN.has(n),
                      )
              }
              renderCite={(n) => {
                const c = byN.get(n) as CitationView;
                return (
                  <CitationChip
                    n={n}
                    active={lit === n}
                    data-cite={n}
                    label={nb(t('sourceLabel', { number: n, title: titleOf(c, t('untitled')) }))}
                    onClick={() => open(c)}
                    onPointerEnter={() => setLit(n)}
                    onPointerLeave={() => setLit(null)}
                    onFocus={() => setLit(n)}
                    onBlur={() => setLit(null)}
                  />
                );
              }}
            />
          )}
          {reply.fixed === 'empty' && citations.length === 0 && (
            <Button asChild variant="link" className="mt-2 text-ui">
              <Link href="/connexions">{t('connectTool')}</Link>
            </Button>
          )}
          {reply.limit && <p className="mt-4 text-ui text-muted">{nb(t('limitNote'))}</p>}
        </div>
        {citations.length > 0 && (
          <SourceNotes
            citations={citations}
            lit={lit}
            fresh={fresh}
            onLit={setLit}
            onOpen={(source) => open(byN.get(source.n) as CitationView)}
          />
        )}
      </div>
      {main && !reply.fixed && (
        // sous la feuille, pas dessus : le texte garde toute sa largeur
        <CopyButton
          value={copyText(stripMarks(main), citations, t('untitled'))}
          variant="quiet"
          size="xs"
          className="mt-1.5 ml-4 text-muted hover:text-fg max-shell:ml-1"
        />
      )}
    </div>
  );
}
