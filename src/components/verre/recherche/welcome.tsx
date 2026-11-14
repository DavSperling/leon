'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { EXAMPLES, EXAMPLES_EN, SYNTAX, SYNTAX_EN } from '@/components/search/examples';
import { searchHref } from '@/components/search/url-state';
import { Button, Fact, Facts, PanelClose, SidePanel } from '@/components/verre';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';

/** Requête en code : la clé des filtres atténuée (`outil:`), la valeur et les phrases exactes en clair. */
export function QueryCode({ q, className }: { q: string; className?: string }) {
  return (
    <code
      className={cn(
        'inline-block max-w-full rounded-chip border border-line bg-glass-3 px-2 py-[3px] font-mono text-label whitespace-pre text-fg',
        className,
      )}
    >
      {(q.match(/"[^"]*"?|\s+|[^\s"]+/g) ?? []).map((part, i) => {
        const m = /^(\p{L}+:)(.+)$/u.exec(part);
        return m ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'une requête figée, dans l'ordre
          <span key={i}>
            <span className="text-muted">{m[1]}</span>
            {m[2]}
          </span>
        ) : (
          part
        );
      })}
    </code>
  );
}

/**
 * « Filtres » à côté des puces de la recherche : un bouton discret qui ouvre, dans le panneau, la syntaxe des filtres
 * (`outil:`, `de:`, `depuis:`…) et quatre recherches d'exemple. Un exemple lance sa recherche.
 */
export function SearchSyntax() {
  const en = useLocale() === 'en';
  const t = useTranslations('welcome');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        {t('syntax')}
      </Button>
      <SidePanel open={open} onOpenChange={setOpen} title={t('filtersTitle')}>
        {/* le code le plus long (« before:2026-10-01 ») ne tient pas dans la colonne de 128px */}
        <Facts className="[&>div]:grid-cols-[168px_minmax(0,1fr)]">
          {(en ? SYNTAX_EN : SYNTAX).map((s) => (
            <Fact key={s.code} label={<QueryCode q={s.code} />}>
              {nb(s.text)}
            </Fact>
          ))}
        </Facts>
        <h3 className="mt-7 text-ui font-semibold text-fg">{t('examplesTitle')}</h3>
        <ul className="mt-2 grid gap-1">
          {(en ? EXAMPLES_EN : EXAMPLES).map((ex) => (
            <li key={ex.q}>
              <PanelClose asChild>
                <Link
                  href={searchHref({ q: ex.q })}
                  className="-mx-2 grid gap-1.5 rounded-item px-2 py-2.5 transition-colors duration-150 hover:bg-hover"
                >
                  <span className="min-w-0">
                    <QueryCode q={ex.q} />
                  </span>
                  <span className="text-ui text-muted">{ex.hint}</span>
                </Link>
              </PanelClose>
            </li>
          ))}
        </ul>
      </SidePanel>
    </>
  );
}

/**
 * Une recherche sans résultat ne laisse pas dans une impasse : quatre recherches d'exemple, en code, qui montrent la
 * syntaxe des filtres. Un clic lance la recherche ; ce qu'elle cherche se lit au survol et au lecteur d'écran.
 */
export function SearchExamples() {
  const en = useLocale() === 'en';
  return (
    <ul className="flex flex-wrap gap-2">
      {(en ? EXAMPLES_EN : EXAMPLES).map((ex) => (
        <li key={ex.q}>
          <Link
            href={searchHref({ q: ex.q })}
            title={ex.hint}
            className="group/ex block rounded-chip transition-transform duration-150 active:translate-y-px"
          >
            <QueryCode
              q={ex.q}
              className="bg-sheet px-2.5 py-1.5 shadow-sheet transition-[border-color,box-shadow] duration-150 group-hover/ex:border-line-strong group-hover/ex:shadow-lift"
            />
            <span className="sr-only">{ex.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
