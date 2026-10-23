import type { ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { Demo, DemoSource } from './content';
import { CitedAnswer, Excerpt, isFilterQuery, LeonMark, QueryCode, ToolLogo } from './parts';

// Démo de l'écran Recherche (barre, réponse citée, sources), en données fictives. Rendue par le serveur ; la démo
// animée du haut de l'accueil (hero-demo.tsx) en reprend les morceaux.

/** La barre de recherche, figée : la requête et le bouton (décoratifs, la vraie barre est dans l'appli). */
export function DemoSearchField({
  query,
  caret,
  className,
  children,
}: {
  query: ReactNode;
  caret?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex h-[56px] items-center gap-3 rounded-box border border-line-strong bg-glass-2 pr-2 pl-4 shadow-hi max-sm:h-[52px] max-sm:pl-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-grid h-[20px] min-w-[20px] place-items-center rounded-[6px] border border-line-strong bg-glass-3 px-[5px] font-mono text-[11px] text-muted"
      >
        /
      </span>
      <span className="min-w-0 flex-1 truncate text-[15.5px] font-medium tracking-[-0.015em] text-fg max-sm:text-[14px]">
        {query}
        {caret && <span aria-hidden="true" className="caret" />}
      </span>
      {children}
      <span
        aria-hidden="true"
        className="inline-flex h-10 shrink-0 items-center rounded-full bg-accent px-4 text-ui font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.3)] max-sm:hidden"
      >
        Rechercher
      </span>
    </div>
  );
}

/** Une source citée : son numéro, le logo de l'outil, le titre, l'auteur et la date, le passage surligné. */
export function DemoSourceRow({
  source,
  n,
  active,
  className,
}: {
  source: DemoSource;
  n: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <li
      data-active={active || undefined}
      className={cn(
        'relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-card border border-line bg-panel px-3.5 py-3 shadow-hi transition-[border-color,background-color] duration-300 data-[active]:border-accent-line data-[active]:bg-accent-soft',
        className,
      )}
    >
      <ToolLogo id={source.tool} size={30} className="mt-0.5" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[11px] text-accent">[{n}]</span>
          <span className="truncate text-ui font-semibold text-fg">{nb(source.title)}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-meta tracking-normal text-muted">
          {source.kind} · {source.author} · {source.date}
        </p>
        <Excerpt
          text={source.excerpt}
          className="mt-1.5 line-clamp-2 block text-label leading-[1.55] text-fg-2"
        />
      </div>
    </li>
  );
}

/** La carte « Réponse de Leon » : filet Signal, renvois [n]. */
export function DemoAnswerCard({
  demo,
  className,
  children,
}: {
  demo: Demo;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'signal-line signal-glow relative overflow-hidden rounded-box border border-line bg-glass-2 px-5 pt-4 pb-5 shadow-hi',
        className,
      )}
    >
      <div className="relative z-[1] flex items-center gap-2">
        <LeonMark />
        <span className="ml-auto font-mono text-meta tracking-normal whitespace-nowrap text-muted">
          {demo.unknown
            ? 'aucune source'
            : `${demo.sources.length} source${demo.sources.length > 1 ? 's' : ''}`}
        </span>
      </div>
      {children ?? (
        <CitedAnswer
          text={demo.answer}
          className="relative z-[1] mt-3 text-[15.5px] leading-[1.7] text-fg"
        />
      )}
    </div>
  );
}

/** La démo complète, figée : barre, réponse, sources. `label` : la mention « Exemple fictif ». */
export function DemoCard({
  demo,
  className,
  sources = true,
  label = true,
}: {
  demo: Demo;
  className?: string;
  sources?: boolean;
  label?: boolean;
}) {
  return (
    <figure
      className={cn(
        'relative rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-3 shadow-panel backdrop-blur-[30px] sm:p-4',
        className,
      )}
    >
      <DemoSearchField
        query={isFilterQuery(demo.query) ? <QueryCode q={demo.query} /> : nb(demo.query)}
      />
      <DemoAnswerCard demo={demo} className="mt-3" />
      {sources && (
        <ol className="mt-3 grid gap-2">
          {demo.sources.map((s, i) => (
            <DemoSourceRow key={s.title} source={s} n={i + 1} />
          ))}
        </ol>
      )}
      {label && (
        <figcaption className="mt-3 px-1 font-mono text-meta tracking-normal text-muted">
          Exemple fictif · l’écran Recherche de Leon
        </figcaption>
      )}
    </figure>
  );
}
