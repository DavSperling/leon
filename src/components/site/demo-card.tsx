'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Demo, type DemoSource, toolLabel } from './content';
import { Excerpt, ToolLogo, tone } from './parts';

// La scène de démo du site, en données fictives, comme l'écran Discussion de l'appli : la feuille de la réponse (la
// question, les phrases, leurs renvois, les sources en lignes) et, à côté, la pile des originaux. Choisir un renvoi ou
// une source met son original sur le dessus. Seuls les mots repris de la source sont surlignés (entre ** dans le texte).

type Token = { at: number } & (
  | { kind: 'text'; value: string }
  | { kind: 'mark'; value: string; n?: number }
  | { kind: 'cite'; n: number }
);

/** Découpe une réponse : le texte, les mots marqués (**…**) et les renvois [n]. Un mot marqué prend la couleur du
 *  renvoi qui clôt sa phrase. */
export function parseAnswer(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*|\[(\d+)\]/g)) {
    if (m.index > last) tokens.push({ at: last, kind: 'text', value: text.slice(last, m.index) });
    tokens.push(
      m[1] !== undefined
        ? { at: m.index, kind: 'mark', value: m[1] }
        : { at: m.index, kind: 'cite', n: Number(m[2]) },
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ at: last, kind: 'text', value: text.slice(last) });
  // le renvoi se colle au mot qui le précède, comme dans l'appli
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    if (tokens[i]?.kind === 'cite' && prev?.kind === 'text') prev.value = prev.value.trimEnd();
  }
  let next: number | undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tk = tokens[i];
    if (!tk) continue;
    if (tk.kind === 'cite') next = tk.n;
    else if (tk.kind === 'mark') tk.n = next;
  }
  return tokens;
}

/** La phrase k (0, 1, 2…) de chaque morceau : une phrase finit à son renvoi. Sert au
 *  mouvement de l'accueil, qui écrit la réponse phrase par phrase (--k). */
export function sentenceOf(tokens: Token[]): number[] {
  let k = 0;
  return tokens.map((tk, i) => {
    const at = k;
    // la ponctuation qui suit le renvoi est écrite avec lui (AnswerText) : le texte d'après ouvre la phrase suivante
    if (tk.kind === 'cite' && tokens[i + 1]?.kind !== 'cite') k++;
    return at;
  });
}

/** La source n arrive avec la première phrase qui la cite (sinon à son rang). */
export function firstSentence(text: string, n: number): number {
  const tokens = parseAnswer(text);
  const ks = sentenceOf(tokens);
  const i = tokens.findIndex((tk) => tk.kind === 'cite' && tk.n === n);
  return i < 0 ? n - 1 : (ks[i] ?? n - 1);
}

const k = (i: number) => ({ '--k': i }) as CSSProperties;

/** Les phrases de la réponse : les mots repris surlignés, les renvois en numéros (des boutons quand on peut choisir). */
export function AnswerText({
  demo,
  active,
  onPick,
  className,
}: {
  demo: Demo;
  active?: number;
  onPick?: (n: number) => void;
  className?: string;
}) {
  const t = useTranslations('site.demo');
  const tokens = parseAnswer(demo.answer);
  const ks = sentenceOf(tokens);
  return (
    <p className={cn('s-answer__text', className)}>
      {tokens.map((tk, j, all) => {
        const i = tk.at;
        const s = k(ks[j] ?? 0);
        // La ponctuation qui suit un renvoi reste collée à lui : elle part dans le même bloc insécable.
        const prev = all[j - 1];
        const next = all[j + 1];
        if (tk.kind === 'text') {
          const value = prev?.kind === 'cite' ? tk.value.replace(/^[.,;:]/, '') : tk.value;
          return (
            value && (
              <span key={i} style={s}>
                {nb(value)}
              </span>
            )
          );
        }
        if (tk.kind === 'mark')
          return (
            // Une date (« 15 nov. ») ne se coupe pas en fin de ligne ; les passages plus longs, si.
            <mark
              key={i}
              style={s}
              className={cn(
                'hl',
                tk.n ? tone(tk.n) : undefined,
                tk.value.split(' ').length <= 2 && 'whitespace-nowrap',
              )}
            >
              {nb(tk.value)}
            </mark>
          );
        const src = demo.sources[tk.n - 1];
        const label = src
          ? t('source', { n: tk.n, tool: toolLabel(src.tool), title: src.title })
          : '';
        const punct = next?.kind === 'text' ? (/^[.,;:]/.exec(next.value)?.[0] ?? '') : '';
        return (
          <span key={i} style={s} className="whitespace-nowrap">
            {/* le gluon : sans lui, le numéro (un bouton) peut passer seul en début de ligne, loin de son mot */}
            {'⁠'}
            {onPick ? (
              <button
                type="button"
                className={cn('cite', tone(tk.n))}
                aria-pressed={active === tk.n}
                aria-label={label}
                onClick={() => onPick(tk.n)}
              >
                {tk.n}
              </button>
            ) : (
              <span className={cn('cite', tone(tk.n))}>
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">{tk.n}</span>
              </span>
            )}
            {punct}
          </span>
        );
      })}
    </p>
  );
}

/** « Outil · type » d'une source, et son tampon quand elle est privée. */
function SourceMeta({ source }: { source: DemoSource }) {
  return (
    <>
      {toolLabel(source.tool)} · {source.kind}
    </>
  );
}

/** La feuille de la réponse : la question (avec les trois traits du champ où l'on demande), la réponse, les sources. */
export function AnswerSheet({
  demo,
  active,
  onPick,
  className,
  children,
}: {
  demo: Demo;
  active?: number;
  onPick?: (n: number) => void;
  className?: string;
  /** Sous la réponse, à la place des sources (le drapeau vide de « je ne sais pas »). */
  children?: ReactNode;
}) {
  const t = useTranslations('site.demo');
  return (
    <div className={cn('s-sheet', className)}>
      <p className="s-answer__q">
        <span aria-hidden="true" className="strokes">
          <i />
          <i />
          <i />
        </span>
        <span>
          <span className="sr-only">{t('question')} </span>
          {nb(demo.query)}
        </span>
      </p>
      <AnswerText demo={demo} active={active} onPick={onPick} />
      {children}
      {demo.sources.length > 0 && (
        <ol aria-label={t('sourcesLabel')}>
          {demo.sources.map((s, i) => {
            const n = i + 1;
            const body = (
              <>
                <span className={cn('num', tone(n))}>
                  <span className="sr-only">{t('sourceWord')} </span>
                  {n}
                </span>
                <ToolLogo id={s.tool} size={20} />
                <span className="min-w-0">
                  <span className="s-note__t truncate">{nb(s.title)}</span>
                  <span className="s-note__m">
                    <SourceMeta source={s} />
                  </span>
                </span>
                {s.private ? <span className="s-stamp">{t('private')}</span> : <span />}
              </>
            );
            return (
              <li key={`${s.tool}-${s.title}`} style={k(firstSentence(demo.answer, n))}>
                {onPick ? (
                  <button
                    type="button"
                    className="s-note"
                    aria-pressed={active === n}
                    onClick={() => onPick(n)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="s-note">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** La pile des originaux : celui qui est choisi dessus, les deux suivants dépassent derrière. Décorative pour les
 *  lecteurs d'écran (les sources sont dans la feuille de la réponse), sauf l'original du dessus. */
export function Pile({
  demo,
  active,
  className,
}: {
  demo: Demo;
  active: number;
  className?: string;
}) {
  const t = useTranslations('site.demo');
  const count = demo.sources.length;
  return (
    <div className={cn('s-pile', className)}>
      {demo.sources.map((s, i) => {
        const slot = (i - (active - 1) + count) % count;
        if (slot > 2) return null;
        const n = i + 1;
        return (
          <article
            key={`${demo.id}-${n}`}
            data-slot={slot}
            data-n={n}
            aria-hidden={slot !== 0 || undefined}
            aria-label={t('original', { title: s.title })}
            style={k(firstSentence(demo.answer, n))}
            className={cn('doc', tone(n))}
          >
            <span aria-hidden="true" className="flag flag--left">
              {n}
            </span>
            <header className="flex items-center gap-2.5">
              <ToolLogo id={s.tool} size={20} />
              <h3 className="min-w-0 truncate text-[15px] font-semibold">{nb(s.title)}</h3>
            </header>
            <p className="doc__meta mt-1">
              <SourceMeta source={s} /> · {s.author} · {nb(s.date)}
            </p>
            <div className="doc__body">
              <p>
                <Excerpt text={s.excerpt} />
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[13px] text-muted">
              {s.private ? <span className="s-stamp">{t('private')}</span> : t('shared')}
            </p>
          </article>
        );
      })}
    </div>
  );
}

/** La scène complète : la réponse à gauche, la pile à droite (sous 1100 px, la réponse seule). */
export function DemoScene({
  demo,
  className,
  pile = true,
  stage,
  onSelect,
}: {
  demo: Demo;
  className?: string;
  pile?: boolean;
  /** L'accueil : la réponse s'écrit phrase par phrase (« load » au chargement, « calm » à une autre question, « end » :
   *  déjà écrite). Le mouvement est en CSS (motion/motion.css). */
  stage?: 'load' | 'calm' | 'end';
  /** L'accueil : le mouvement enveloppe le choix d'une source (commit pose l'état, tout de suite). */
  onSelect?: (n: number, commit: () => void) => void;
}) {
  const [active, setActive] = useState(1);
  const shown = Math.min(active, Math.max(demo.sources.length, 1));
  const pick = (n: number) => {
    if (onSelect) onSelect(n, () => flushSync(() => setActive(n)));
    else setActive(n);
  };
  return (
    <div className={cn('s-grid items-center', className)} data-stage={stage}>
      <AnswerSheet
        demo={demo}
        active={shown}
        onPick={pick}
        className={cn('col-[1/13]', pile && 'min-[1100px]:col-[1/8]')}
      />
      {pile && demo.sources.length > 0 && (
        <Pile demo={demo} active={shown} className="col-[8/13] mt-10 max-[1099px]:hidden" />
      )}
    </div>
  );
}
