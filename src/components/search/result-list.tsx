'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { previewPassageAction } from '@/app/(app)/actions';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type OpenPassage, ResultItem } from './result-item';
import { type PreviewState, ResultPreview } from './result-preview';
import type { ResultView } from './view-model';

export type PaginationLinks = {
  page: number;
  pages: number;
  previousHref: string | null;
  nextHref: string | null;
};

function Pagination({ page, pages, previousHref, nextHref }: PaginationLinks) {
  if (pages <= 1) return null;
  const link = 'h-9 gap-1 rounded-lg px-3 text-[15px]';
  // Trois colonnes, les deux côtés d'égale largeur : « Page 2 sur 2 » reste au centre quand « Suivant » ou
  // « Précédent » manque.
  return (
    <nav
      aria-label="Pages de résultats"
      className="grid grid-cols-[1fr_auto_1fr] items-center pt-6"
    >
      {previousHref ? (
        <Link
          href={previousHref}
          rel="prev"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            link,
            'col-start-1 justify-self-start',
          )}
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          Précédent
        </Link>
      ) : null}
      <p className="col-start-2 text-[15px] text-muted-foreground tabular-nums">
        Page {page} sur {pages}
      </p>
      {nextHref ? (
        <Link
          href={nextHref}
          rel="next"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            link,
            'col-start-3 justify-self-end',
          )}
        >
          Suivant
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

// Les résultats d'une page et leur aperçu. L'aperçu se charge à la demande (action du serveur, sous les droits
// de l'utilisateur) : ouvrir un résultat ne relance pas la recherche.
export function ResultList({
  results,
  terms,
  pagination,
}: {
  results: ResultView[];
  terms: string[];
  pagination: PaginationLinks;
}) {
  const [state, setState] = useState<PreviewState>({ status: 'vide' });
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  // Le dernier clic a la main : la réponse d'un aperçu abandonné est jetée.
  const latest = useRef(0);
  // Ce qui a ouvert l'aperçu, pour y remettre le curseur à sa fermeture.
  const opener = useRef<HTMLElement | null>(null);
  const open = state.status !== 'vide';

  const close = () => {
    latest.current += 1;
    setState({ status: 'vide' });
    setSelectedPassageId(null);
    opener.current?.focus();
    opener.current = null;
  };

  const openPassage: OpenPassage = (result, passage, trigger) => {
    const request = ++latest.current;
    opener.current ??= trigger;
    setSelectedPassageId(passage.passageId);
    setState({ status: 'charge', result });
    previewPassageAction(passage.passageId)
      .then((answer) => {
        if (request !== latest.current) return;
        setState(
          answer.ok
            ? { status: 'pret', result, preview: answer.preview }
            : { status: answer.reason, result },
        );
      })
      .catch(() => {
        if (request === latest.current) setState({ status: 'erreur', result });
      });
  };

  // L'aperçu s'ouvre : le curseur y va (flèches et lecteurs d'écran), Échap le ferme.
  const opened = state.status !== 'vide';
  useEffect(() => {
    if (opened) panel.current?.focus({ preventScroll: true });
  }, [opened]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="@container">
      <div className="grid gap-x-10 @[920px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <ul>
            {results.map((result) => (
              <ResultItem
                key={result.sourceId}
                result={result}
                selectedPassageId={selectedPassageId}
                onOpen={openPassage}
              />
            ))}
          </ul>
          <Pagination {...pagination} />
        </div>
        {open && (
          // Sous la feuille de l'aperçu (fenêtre étroite) : un clic à côté la ferme. Inutile au clavier : Échap, ou
          // le bouton de fermeture de l'aperçu.
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-30 cursor-default bg-foreground/30 duration-200 animate-in fade-in-0 @[920px]:hidden"
          />
        )}
        <ResultPreview ref={panel} state={state} terms={terms} onClose={close} />
      </div>
    </div>
  );
}
