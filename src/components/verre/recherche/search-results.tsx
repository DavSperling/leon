'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { resultAnchorId } from '@/components/search/answer-text';
import { searchHref } from '@/components/search/url-state';
import type { ResultView } from '@/components/search/view-model';
import {
  Button,
  EmptyState,
  Notice,
  Pagination,
  Section,
  Thing,
  ThingGrid,
  ToolLogo,
} from '@/components/verre';
import { useSourcePanel } from '@/components/verre/discussions/preview';
import { nb } from '@/lib/verre';
import { AnswerCard } from './answer';
import { SearchExamples } from './welcome';

/**
 * Sous le champ et les filtres : la réponse de Leon, les avis, les résultats en tuiles et leur pagination. La page
 * (serveur) a tout calculé ; ici ne vit que le panneau de l'original : une tuile, ou un numéro de la réponse, l'ouvre
 * sur le premier passage trouvé du résultat, avec ses autres passages trouvés dessous.
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
  /** les mots cherchés, repérés dans le texte de l'original */
  terms: string[];
  /** « 12 sources », « Environ 140 sources » : pour le lecteur d'écran */
  count: string;
  unknownPeople: string | null;
  /** la recherche a échoué */
  failed: boolean;
  /** la réponse en tête : première page, des résultats, un modèle branché */
  answer: boolean;
}) {
  const t = useTranslations('searchResults');
  const sources = useSourcePanel({ terms });

  const open = (n: number) => {
    const r = results[n - 1];
    const [first] = r?.passages ?? [];
    if (!r || !first) return;
    sources.open({
      n,
      passageId: first.passageId,
      title: r.title,
      url: r.url,
      kind: r.kind,
      others: r.passages,
    });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {answer && <AnswerCard key={q} q={q} results={results} onCite={open} />}

      {unknownPeople && (
        <Notice tone="warning" live="status">
          {unknownPeople}
        </Notice>
      )}
      {failed && (
        <Notice tone="error" live="alert">
          {nb(t('failed'))}
        </Notice>
      )}
      {!failed &&
        results.length === 0 &&
        (page === 1 ? (
          <EmptyState
            title={t('none')}
            description={t('noneDescription')}
            action={<SearchExamples />}
          />
        ) : (
          <EmptyState
            title={t('shortPage')}
            description={t('shortPageDescription')}
            action={
              <Button asChild size="sm" icon={ArrowLeft}>
                <Link href={searchHref({ q })}>{t('firstPage')}</Link>
              </Button>
            }
          />
        ))}

      {results.length > 0 && (
        // pas de compte à l'écran (règle 2 du fondateur) : « Environ 140 sources » se lit au lecteur d'écran seulement
        <Section id="resultats" title={t('sources')} className="mt-4">
          {/* où la pagination pose le focus après un changement de page */}
          <span id="resultats-page" tabIndex={-1} className="sr-only">
            {count}
          </span>
          <ThingGrid cols={3}>
            {results.map((r, i) => (
              <Thing
                key={r.sourceId}
                id={resultAnchorId(r.sourceId)}
                num={i + 1}
                picture={<ToolLogo kind={r.kind} size={28} />}
                name={r.title?.trim() || t('untitled')}
                caption={r.natureLabel || r.kindLabel}
                onClick={() => open(i + 1)}
              />
            ))}
          </ThingGrid>
          {pages > 1 && (
            <Pagination
              className="mt-6"
              page={page}
              pages={pages}
              href={(p) => searchHref({ q, page: p })}
              focusId="resultats-page"
            />
          )}
        </Section>
      )}
      {sources.panel}
    </div>
  );
}
