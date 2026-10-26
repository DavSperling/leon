'use client';

import { ChevronDown, CircleAlert, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Beam,
  CitationChip,
  CitedText,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  GlassCard,
} from '@/components/verre';
import {
  DISCUSSION_EMPTY,
  DISCUSSION_LIMIT_NOTE,
  DISCUSSION_REFUSAL,
  type DiscussionCitation,
} from '@/lib/discussion-events';
import { cn, duration, ease, nb } from '@/lib/verre';

// Un message du fil : la question (bulle à droite) ou la carte « ✦ Leon » : activité, texte en flux, renvois, sources
// citées. Un renvoi et une source ouvrent l'aperçu du passage cité, sans quitter la page. Le texte vient du modèle :
// jamais lu comme du HTML.

/** Ouvre l'aperçu d'une citation : la clé (message:n) éclaire la puce et la ligne liées. */
export type OpenCitation = (
  key: string,
  citation: DiscussionCitation,
  trigger: HTMLElement,
) => void;

const titleOf = (citation: DiscussionCitation, fallback: string): string =>
  citation.title?.trim() || fallback;

/** Une limite atteinte s'ajoute à la fin du texte (finalReplyText) : affichée à part, en note. */
function splitLimit(text: string): [string, string | null] {
  return text.endsWith(DISCUSSION_LIMIT_NOTE)
    ? [text.slice(0, -DISCUSSION_LIMIT_NOTE.length).trimEnd(), DISCUSSION_LIMIT_NOTE]
    : [text, null];
}

/** Lignes de sources (citées, ou résultats d'origine d'une question) : numéro, titre qui ouvre l'aperçu, original. */
function SourceRows({
  citations,
  msgId,
  active,
  onOpen,
  fresh,
}: {
  citations: DiscussionCitation[];
  msgId: string;
  active: string | null;
  onOpen: OpenCitation;
  fresh?: boolean;
}) {
  const t = useTranslations('discussionView');
  return (
    <ol className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-px">
      {citations.map((c, i) => {
        const key = `${msgId}:${c.n}`;
        return (
          <motion.li
            key={c.n}
            initial={fresh ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.enter, ease: ease.out, delay: 0.15 + i * 0.05 }}
            data-active={active === key || undefined}
            className="group/src -mx-2 flex min-h-9 items-center gap-2.5 rounded-field px-2 transition-colors duration-200 hover:bg-hover data-[active]:bg-accent-soft"
          >
            <span
              aria-hidden="true"
              className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 font-mono text-[11px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)] transition-colors group-data-[active]/src:bg-accent group-data-[active]/src:text-accent-ink"
            >
              {c.n}
            </span>
            <button
              type="button"
              onClick={(e) => onOpen(key, c, e.currentTarget)}
              className={cn(
                'min-w-0 truncate rounded-sm py-1.5 text-left text-ui font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline',
                !c.title?.trim() && 'text-muted',
              )}
            >
              <span className="sr-only">{t('readSource', { number: c.n })}</span>
              {titleOf(c, t('untitled'))}
            </button>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                aria-label={nb(t('openOriginal', { title: titleOf(c, t('untitled')) }))}
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
              >
                <ExternalLink aria-hidden="true" className="size-[15px]" strokeWidth={1.7} />
              </a>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

/** « 4 sources citées » : ouvert sur la dernière réponse, replié sur les précédentes. */
function CitedSources({
  citations,
  msgId,
  open,
  active,
  onOpen,
  fresh,
}: {
  citations: DiscussionCitation[];
  msgId: string;
  open: boolean;
  active: string | null;
  onOpen: OpenCitation;
  fresh?: boolean;
}) {
  // suit la dernière réponse (se replie quand une autre arrive) tant qu'on n'y a pas touché
  const t = useTranslations('discussionView');
  const [chosen, setChosen] = useState<boolean | null>(null);
  const n = citations.length;
  return (
    <Collapsible
      open={chosen ?? open}
      onOpenChange={setChosen}
      className="mt-4 border-t border-line pt-2"
    >
      <CollapsibleTrigger className="group -mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-field px-1.5 text-label font-semibold text-muted transition-colors hover:text-fg">
        {t('citedSources', { count: n })}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-[rotate] duration-200 group-data-[state=open]:rotate-180"
          strokeWidth={2}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(chosen === null && 'animate-none')}>
        <SourceRows
          citations={citations}
          msgId={msgId}
          active={active}
          onOpen={onOpen}
          fresh={fresh}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function UserBubble({
  id,
  content,
  seeds,
  active,
  onOpen,
}: {
  id: string;
  content: string;
  // Les résultats de la barre d'où part la discussion (sur sa première question seulement).
  seeds: DiscussionCitation[];
  active: string | null;
  onOpen: OpenCitation;
}) {
  const t = useTranslations('discussionView');
  return (
    <div className="ml-auto w-fit max-w-[88%] rounded-box rounded-br-[6px] border border-accent-line bg-accent-soft px-4 py-3 shadow-hi">
      <p className="sr-only">{t('you')}</p>
      <p className="text-lead leading-[1.6] break-words whitespace-pre-wrap text-fg">{content}</p>
      {seeds.length > 0 && (
        // les résultats d'origine sont secondaires : repliés, ouverts à la demande
        <Collapsible className="mt-2.5 border-t border-accent-line pt-1.5">
          <CollapsibleTrigger className="group -mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-field px-1.5 text-label font-semibold text-fg-2 transition-colors hover:text-fg">
            {t('searchSeeds', { count: seeds.length })}
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 transition-[rotate] duration-200 group-data-[state=open]:rotate-180"
              strokeWidth={2}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SourceRows citations={seeds} msgId={id} active={active} onOpen={onOpen} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Réponse en cours : ce que Leon fait (avant son premier mot), puis le texte reçu. */
export type Live = { activity: string | null; text: string };

type LeonCardProps = {
  id: string;
  content: string;
  citations: DiscussionCitation[];
  /** Réponse en cours. */
  live?: Live;
  /** Réponse qui vient d'arriver : les renvois éclosent, les sources montent. */
  fresh?: boolean;
  /** La dernière carte de Leon du fil : seule à porter le signal, ses sources ouvertes. */
  latest?: boolean;
  active: string | null;
  onOpen: OpenCitation;
  onHover: (key: string | null) => void;
};

export function LeonCard({
  id,
  content,
  citations,
  live,
  fresh,
  latest,
  active,
  onOpen,
  onHover,
}: LeonCardProps) {
  const t = useTranslations('discussionView');
  const byN = new Map(citations.map((c) => [c.n, c]));
  const [main, limit] = splitLimit(content);
  const fixed = content === DISCUSSION_REFUSAL || content === DISCUSSION_EMPTY;
  return (
    <Beam active={Boolean(live)} className="rounded-box">
      <GlassCard
        variant="raised"
        signal={latest}
        className={cn(
          'px-5 pt-4 pb-4 transition-[border-color] duration-500 sm:px-6',
          live && 'border-accent-line',
        )}
      >
        <div className="flex items-center gap-1.5 text-ui font-semibold text-accent">
          <Sparkles aria-hidden="true" className="size-[15px]" strokeWidth={1.7} />
          Leon
        </div>
        {live && live.text === '' ? (
          <p className="mt-2.5 flex min-h-[1.7em] items-center gap-2.5 text-body text-fg-2">
            <span className="spin" aria-hidden="true" />
            {live.activity}
          </p>
        ) : live ? (
          <p className="mt-2.5 max-w-[72ch] text-lead leading-[1.72] break-words whitespace-pre-wrap text-fg">
            {/* Les renvois [n] restent du texte jusqu'à la fin : leurs sources arrivent avec elle. */}
            {live.text}
            <span className="caret-block" aria-hidden="true" />
          </p>
        ) : (
          main && (
            <p
              className={cn(
                'mt-2.5 max-w-[72ch] text-lead leading-[1.72] break-words whitespace-pre-wrap',
                fixed ? 'text-fg-2' : 'text-fg',
              )}
            >
              <CitedText
                text={main}
                keep={(n) => byN.has(n)}
                renderCite={(n) => {
                  const c = byN.get(n) as DiscussionCitation;
                  const key = `${id}:${n}`;
                  return (
                    <CitationChip
                      n={n}
                      label={nb(t('sourceLabel', { number: n, title: titleOf(c, t('untitled')) }))}
                      active={active === key}
                      animate={fresh}
                      onClick={(e) => onOpen(key, c, e.currentTarget)}
                      onMouseEnter={() => onHover(key)}
                      onMouseLeave={() => onHover(null)}
                      onFocus={() => onHover(key)}
                      onBlur={() => onHover(null)}
                    />
                  );
                }}
              />
            </p>
          )
        )}
        {!live && limit && (
          <motion.p
            initial={fresh ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.out, delay: 0.2 }}
            className="mt-3 flex gap-2.5 rounded-field bg-glass-3 px-3.5 py-2.5 text-ui text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-[2px] size-4 shrink-0 text-muted"
              strokeWidth={1.8}
            />
            {nb(limit)}
          </motion.p>
        )}
        {!live && citations.length > 0 && (
          <CitedSources
            citations={citations}
            msgId={id}
            open={Boolean(latest)}
            active={active}
            onOpen={onOpen}
            fresh={fresh}
          />
        )}
      </GlassCard>
    </Beam>
  );
}
