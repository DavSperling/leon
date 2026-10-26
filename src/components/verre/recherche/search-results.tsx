'use client';

import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { previewPassageAction } from '@/app/(app)/actions';
import { searchHref } from '@/components/search/url-state';
import type { ResultView } from '@/components/search/view-model';
import { Button, EmptyState, Notice, Pagination } from '@/components/verre';
import { cn, useMinWidth } from '@/lib/verre';
import { AnswerCard } from './answer';
import { type Opened, PreviewPane, PreviewSheet } from './preview';
import { type OpenPreview, ResultCard } from './results';

// L'aperçu tient à droite des résultats quand la page a la place (requête de conteneur) ; en dessous, c'est une feuille.
const WIDE_PX = 900;

// Au chargement complet de la page, les résultats sont déjà là (rendu serveur) : pas d'entrée, rien d'invisible avant
// l'hydratation. Chaque recherche suivante les fait monter un à un.
let booted = false;

/**
 * Sous la barre et les filtres : la réponse de Leon, les avis, les résultats et leur pagination, l'aperçu. La page
 * (serveur) a tout calculé ; ici ne vivent que l'aperçu ouvert et les liens entre renvois et résultats.
 */
export function SearchResults({
  q,
  page,
  pages,
  results,
  terms,
  count,
  unknownPeople,
  failed,
  answer,
}: {
  q: string;
  page: number;
  pages: number;
  results: ResultView[];
  /** les mots cherchés, repérés dans le texte de l'aperçu */
  terms: string[];
  /** « 12 sources », « Environ 140 sources » */
  count: string;
  unknownPeople: string | null;
  /** la recherche a échoué */
  failed: boolean;
  /** la réponse en tête : première page, des résultats, un modèle branché */
  answer: boolean;
}) {
  const [appear] = useState<false | 'initial'>(() => (booted ? 'initial' : false));
  const t = useTranslations('searchResults');
  useEffect(() => {
    booted = true;
  }, []);
  const root = useRef<HTMLDivElement>(null);
  const wide = useMinWidth(root, WIDE_PX);
  const [sel, setSel] = useState<Opened | null>(null);
  const [lit, setLit] = useState<number | null>(null); // renvoi survolé → son résultat s'éclaire
  const [hovered, setHovered] = useState<number | null>(null); // résultat survolé → ses renvois s'éclairent
  const opener = useRef<HTMLElement | null>(null);
  const pane = useRef<HTMLElement>(null);
  // Le dernier clic a la main : la réponse d'un aperçu abandonné est jetée.
  const latest = useRef(0);

  const openPreview: OpenPreview = useCallback(
    (result, n, passage, el, focusPane = true) => {
      const request = ++latest.current;
      if (el) opener.current = el;
      // la feuille rend le focus à ce qui l'avait à l'ouverture : Safari ne le donne pas au bouton touché, on le pose
      if (el && !wide) el.focus({ preventScroll: true });
      const base = { result, n, passageId: passage.passageId };
      setSel({ ...base, status: 'charge' });
      previewPassageAction(passage.passageId)
        .then((answer) => {
          if (request !== latest.current) return;
          setSel(
            answer.ok
              ? { ...base, status: 'pret', preview: answer.preview }
              : { ...base, status: answer.reason },
          );
        })
        .catch(() => {
          if (request === latest.current) setSel({ ...base, status: 'erreur' });
        });
      // écran large : le curseur va dans l'aperçu (flèches, lecteurs d'écran) ; Échap le rend à ce qui l'a ouvert
      if (focusPane && wide)
        requestAnimationFrame(() => pane.current?.focus({ preventScroll: true }));
    },
    [wide],
  );

  const close = useCallback(() => {
    latest.current += 1;
    setSel(null);
    const el = opener.current;
    opener.current = null;
    // la feuille rend le focus seule
    if (wide) requestAnimationFrame(() => el?.isConnected && el.focus({ preventScroll: true }));
  }, [wide]);

  useEffect(() => {
    if (!sel || !wide) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel, wide, close]);

  // Renvoi cliqué : l'aperçu s'ouvre sans bouger la réponse. Au clavier, le curseur entre dans le panneau ; à la
  // souris, il reste sur la puce, qui éclaire déjà son résultat.
  const onCite = (n: number, el: HTMLElement, keyboard: boolean) => {
    const r = results[n - 1];
    const first = r?.passages[0];
    if (r && first) openPreview(r, n, first, el, keyboard);
  };

  const showPane = results.length > 0;

  return (
    // La mise en page suit une requête de conteneur (juste dès le rendu serveur) ; `wide` ne choisit que panneau ou feuille.
    <div ref={root} className="@container grid grid-cols-[minmax(0,1fr)]">
      {/* la réponse et les résultats forment une colonne ; l'aperçu colle à droite sur large écran */}
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] items-start gap-5',
          showPane && '@[900px]:grid-cols-[minmax(0,1fr)_380px]',
        )}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          {answer && (
            <AnswerCard
              key={q}
              q={q}
              results={results}
              lit={[lit, hovered, sel?.n ?? null]}
              onLit={setLit}
              onCite={onCite}
            />
          )}

          {unknownPeople && (
            <Notice tone="warning" live="status">
              {unknownPeople}
            </Notice>
          )}
          {failed && (
            <Notice tone="error" live="alert">
              {t('failed')}
            </Notice>
          )}
          {!failed &&
            results.length === 0 &&
            (page === 1 ? (
              <EmptyState icon={SearchX} title={t('none')} description={t('noneDescription')} />
            ) : (
              <EmptyState
                icon={SearchX}
                title={t('shortPage')}
                description={t('shortPageDescription')}
                action={
                  <Button asChild icon={ArrowLeft}>
                    <Link href={searchHref({ q })}>{t('firstPage')}</Link>
                  </Button>
                }
              />
            ))}

          {results.length > 0 && (
            <section aria-labelledby="resultats-titre" className="min-w-0">
              <h2 id="resultats-titre" tabIndex={-1} className="sr-only">
                {t('results')}
              </h2>
              <p role="status" className="mb-3 text-meta text-muted tabular-nums">
                {count}
              </p>
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
                {results.map((r, i) => (
                  <ResultCard
                    key={r.sourceId}
                    r={r}
                    n={i + 1}
                    appear={appear}
                    lit={lit === i + 1}
                    selectedPassageId={sel?.result.sourceId === r.sourceId ? sel.passageId : null}
                    onOpen={openPreview}
                    onHover={setHovered}
                  />
                ))}
              </ol>
              {pages > 1 && (
                <Pagination
                  className="mt-6"
                  page={page}
                  pages={pages}
                  href={(p) => searchHref({ q, page: p })}
                  focusId="resultats-titre"
                />
              )}
            </section>
          )}
        </div>
        {showPane && <PreviewPane ref={pane} sel={sel} terms={terms} onClose={close} />}
      </div>
      {!wide && <PreviewSheet sel={sel} terms={terms} onClose={close} />}
    </div>
  );
}
