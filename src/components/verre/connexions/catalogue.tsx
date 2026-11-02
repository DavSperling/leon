'use client';

import { Search, SearchX, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import {
  Badge,
  Button,
  EmptyState,
  GlassCard,
  IconButton,
  Pill,
  Section,
  ToolIcon,
} from '@/components/verre';
import { PROVIDER_FAMILIES_ORDER, type ProviderFamily } from '@/lib/providers';
import { cn, duration, fold, nb } from '@/lib/verre';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { connectedTools, recommendedToConnect } from './model';
import { connState, StateWord, stateDetail } from './parts';

// Catalogue en deux zones : « Vos outils branchés » (une ligne par outil, son état en mot + icône, les problèmes d'abord)
// puis « À brancher » (tuiles compactes par famille). Un seul filtre, collant. Rien ne bouge au défilement ; seul un outil
// branché ou retiré passe d'une zone à l'autre.

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.enter } },
  exit: { opacity: 0, transition: { duration: duration.exit } },
};

/** Un outil branché : nom, puis une ligne par connexion (état écrit et compte ; la raison seulement pour un problème), et « Gérer ».
 *  Dernier passage et nombre d'éléments : dans la fenêtre de l'outil. */
function ConnectedRow({
  p,
  conns,
  now,
  onOpen,
  fresh,
}: {
  p: CatalogItem;
  conns: ConnectionView[];
  now: Date;
  onOpen: () => void;
  fresh: boolean;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  return (
    <motion.li
      layout="position"
      {...fadeIn}
      className={cn('relative flex items-start gap-3 px-4 py-3 sm:px-5', fresh && 'cx-fresh-row')}
    >
      <ToolIcon kind={p.id} boxed className="mt-px" />
      <div className="grid min-w-0 flex-1 gap-1 @3xl:grid-cols-[9.5rem_minmax(0,1fr)] @3xl:items-baseline @3xl:gap-x-4">
        <p className="text-body font-semibold tracking-[-0.01em] text-fg">{p.label}</p>
        <ul className="grid gap-1">
          {conns.map((c) => {
            const reason = connState(c).tone === 'destructive' ? stateDetail(c, now, locale) : null;
            return (
              <li key={c.id} className="grid gap-0.5 @lg:flex @lg:items-baseline @lg:gap-3">
                <StateWord c={c} className="@lg:w-[6.5rem] @lg:shrink-0" />
                <p className="min-w-0 text-label break-words text-fg-2">
                  {c.label}
                  {reason && (
                    <span className="text-muted">
                      <span aria-hidden="true"> · </span>
                      <span className="sr-only">, </span>
                      {nb(reason)}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      <Button size="sm" variant="quiet" data-outil={p.id} onClick={onOpen} className="-my-0.5">
        {t('manage')}
        <span className="sr-only"> {p.label}</span>
      </Button>
    </motion.li>
  );
}

/** Un outil libre : icône, nom, « Brancher » (ou « Bientôt » sans connecteur). Plus léger qu'une ligne branchée. */
function FreeTile({ p, onOpen }: { p: CatalogItem; onOpen: () => void }) {
  const t = useTranslations('connections');
  return (
    <motion.li
      layout="position"
      {...fadeIn}
      className="flex min-w-0 items-center gap-3 rounded-field border border-line py-1.5 pr-1.5 pl-3"
    >
      <ToolIcon kind={p.id} boxed />
      <span className="min-w-0 flex-1 truncate text-ui text-fg">{p.label}</span>
      {p.available ? (
        <Button size="sm" variant="quiet" data-outil={p.id} onClick={onOpen}>
          {t('connect')}
          <span className="sr-only"> {p.label}</span>
        </Button>
      ) : (
        <Badge className="mr-1.5">{t('soon')}</Badge>
      )}
    </motion.li>
  );
}

export function Catalogue({
  catalog,
  recommended,
  conns,
  now,
  onOpen,
  filter,
  onFilter,
  fresh,
}: {
  catalog: CatalogItem[];
  /** Les outils du service de la personne : ceux qu'il lui reste à brancher passent en tête. */
  recommended: ProviderId[];
  conns: ConnectionView[];
  now: Date;
  onOpen: (id: ProviderId) => void;
  filter: string;
  onFilter: (q: string) => void;
  /** Outil tout juste branché : un anneau bat une fois autour de sa ligne. */
  fresh: string | null;
}) {
  const t = useTranslations('connections');
  // Une famille à la fois (« Dev », « CRM »…) ; null : toutes. Se combine avec le texte du champ.
  const [family, setFamily] = useState<ProviderFamily | null>(null);
  const families = PROVIDER_FAMILIES_ORDER.filter((id) => catalog.some((p) => p.family === id));
  const q = fold(filter.trim());
  const match = (p: CatalogItem) =>
    (family === null || p.family === family) &&
    (!q || fold(p.label).includes(q) || fold(t(`family.${p.family}`)).includes(q));
  const connected = connectedTools(catalog, conns).filter(match);
  const advised = recommendedToConnect(catalog, conns, recommended).filter(match);
  // Un outil conseillé n'est plus listé sous « À brancher » ; « Branchés » ne change pas.
  const free = catalog.filter(
    (p) => !conns.some((c) => c.provider === p.id) && match(p) && !advised.includes(p),
  );
  const groups = PROVIDER_FAMILIES_ORDER.map((id) => ({
    id,
    label: t(`family.${id}`),
    tools: free.filter((p) => p.family === id),
  })).filter((g) => g.tools.length);
  const count = new Set([...advised, ...connected, ...free].map((p) => p.id)).size;
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* mobile : bande pleine largeur collée sous la barre du haut ; large : le champ seul, collant */}
      <div className="sticky top-14 z-20 mb-2 max-shell:-mx-4 max-shell:border-b max-shell:border-line-strong max-shell:px-4 max-shell:py-2 max-shell:glass-float shell:top-3 shell:w-[320px] shell:max-w-full">
        <search className="relative">
          <Search
            aria-hidden="true"
            strokeWidth={1.7}
            className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={input}
            type="search"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && filter) {
                e.preventDefault();
                onFilter('');
              }
            }}
            placeholder={t('filter')}
            aria-label={t('filter')}
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full rounded-field border border-line-strong bg-glass-2 pr-9 pl-9 text-ui text-fg shadow-hi outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] shell:glass-float [&::-webkit-search-cancel-button]:appearance-none"
          />
          {filter && (
            <IconButton
              icon={X}
              label={t('clearFilter')}
              size="sm"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              tooltip={false}
              onClick={() => {
                onFilter('');
                input.current?.focus();
              }}
            />
          )}
        </search>
        <p className="sr-only" aria-live="polite">
          {q || family ? t('count', { count }) : ''}
        </p>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: un groupe de boutons bascule, pas un formulaire (fieldset) */}
      <div role="group" aria-label={t('families')} className="mt-3 flex flex-wrap gap-2">
        <Pill
          variant={family === null ? 'active' : 'default'}
          aria-pressed={family === null}
          onClick={() => setFamily(null)}
        >
          {t('all')}
        </Pill>
        {families.map((id) => (
          <Pill
            key={id}
            variant={family === id ? 'active' : 'default'}
            aria-pressed={family === id}
            // un second clic sur la famille choisie revient à tous les outils
            onClick={() => setFamily(family === id ? null : id)}
          >
            {t(`family.${id}`)}
          </Pill>
        ))}
      </div>

      {advised.length > 0 && (
        <Section
          id="conseilles"
          title={t('recommended')}
          className="mt-8 scroll-mt-[124px] shell:scroll-mt-[84px]"
        >
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2">
            <AnimatePresence initial={false}>
              {advised.map((p) => (
                <FreeTile key={p.id} p={p} onOpen={() => onOpen(p.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </Section>
      )}

      {connected.length > 0 && (
        <Section
          id="branches"
          title={t('connected')}
          className="mt-8 scroll-mt-[124px] shell:scroll-mt-[84px]"
        >
          <GlassCard className="@container">
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {connected.map((p) => (
                  <ConnectedRow
                    key={p.id}
                    p={p}
                    conns={conns.filter((c) => c.provider === p.id)}
                    now={now}
                    onOpen={() => onOpen(p.id)}
                    fresh={fresh === p.id}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </GlassCard>
        </Section>
      )}

      {free.length > 0 && (
        <Section
          id="a-brancher"
          title={t('toConnect')}
          className="mt-10 scroll-mt-[124px] shell:scroll-mt-[84px]"
        >
          <div className="grid gap-6">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`famille-${g.id}-titre`}>
                <h3 id={`famille-${g.id}-titre`} className="mb-2.5 text-ui font-semibold text-fg-2">
                  {g.label}
                </h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2">
                  <AnimatePresence initial={false}>
                    {g.tools.map((p) => (
                      <FreeTile key={p.id} p={p} onOpen={() => onOpen(p.id)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        </Section>
      )}

      {count === 0 && (
        <EmptyState
          icon={SearchX}
          className="mt-8"
          title={t('noMatch')}
          description={
            q
              ? t('noMatchQuery', {
                  query: filter.trim(),
                  scope: family
                    ? t('inFamily', { family: t(`family.${family}`) })
                    : t('catalogueCount', { count: catalog.length }),
                })
              : t('noFamily', { family: family ? t(`family.${family}`) : '' })
          }
          action={
            <Button
              onClick={() => {
                onFilter('');
                setFamily(null);
                input.current?.focus();
              }}
            >
              {t('clearFilters')}
            </Button>
          }
        />
      )}
    </>
  );
}
