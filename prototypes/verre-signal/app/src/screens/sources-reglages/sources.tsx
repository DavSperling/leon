import { ChevronDown, CircleCheck, ExternalLink, FileSearch, Inbox, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger, EmptyState, GlassCard, PageHeader, Pagination, SourceChip, StatusBadge, ToolIcon, Tooltip,
} from '@/components';
import { CHANNEL_STATUS, type ChannelStatus, type IndexingStatus, SOURCES, SOURCES_PAGE_SIZE, type SourceRow, sourcesPage } from '@/data';
import { cn, duration, formatDateTime, formatNumber, formatRelative, nb, scrollToTop } from '@/lib';

// Une borne pour l'adresse, comme le vrai Leon : « ?page=99999999999 » ne part pas en décalage.
const PAGE_LIMIT = 10_000;
const href = (p: number) => (p > 1 ? `/sources?page=${p}` : '/sources');

/** Canaux tels qu'ils seraient sans aucune conversation captée (?vide=1). */
const NO_CAPTURE: ChannelStatus[] = CHANNEL_STATUS.map((c) => ({ ...c, lastCaptureAt: null, late: false, text: nb(`${c.label} : aucune capture`) }));

export function Sources() {
  const [params] = useSearchParams();
  const raw = params.get('page');
  const page = raw && /^\d+$/.test(raw) ? Math.min(Math.max(Number(raw), 1), PAGE_LIMIT) : 1;
  const empty = params.get('vide') === '1';
  const rows = empty ? [] : sourcesPage(page);
  const hasNext = !empty && page * SOURCES_PAGE_SIZE < SOURCES.length;
  const openError = params.get('erreur') === '1';

  // Même chemin, autre page (clic ou précédent/suivant du navigateur) : retour en haut, focus au tableau, lu « Sources, page 2 ».
  const regionRef = useRef<HTMLDivElement>(null);
  const shown = useRef(page);
  useEffect(() => {
    if (shown.current === page) return;
    shown.current = page;
    scrollToTop();
    regionRef.current?.focus({ preventScroll: true });
  }, [page]);
  // ?erreur=1 : l'erreur dépliée est plus bas que le pli, on l'amène au centre
  useEffect(() => {
    if (openError) [...document.querySelectorAll<HTMLElement>('[data-erreur-ouverte]')].find((e) => e.offsetParent)?.scrollIntoView({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Sources" subtitle="Les conversations brutes restent privées ; ce que lisent les connexions est visible de l’équipe." className="mb-6" />
      <Channels channels={empty ? NO_CAPTURE : CHANNEL_STATUS} />

      <div ref={regionRef} tabIndex={-1} role="region" aria-label={`Sources, page ${page}`} className="@container mt-8 outline-none">
        {rows.length === 0 && page === 1 ? (
          <EmptyState
              icon={Inbox}
              title="Aucune conversation captée."
              description={<>Installez l’extension ou lancez <code className="rounded-[6px] border border-line bg-glass-3 px-1.5 py-px text-[12.5px] whitespace-nowrap text-fg-2">pnpm leon import-claude-code</code>.</>}
            />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileSearch} title="Cette page est vide." description="Les sources s’arrêtent avant : revenez à la page précédente." />
        ) : (
          // clé = page : un court fondu signale la nouvelle page (rien d'autre ne bouge)
          <motion.div key={page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.enter }}>
            <Table rows={rows} openError={openError} />
            <Cards rows={rows} openError={openError} />
          </motion.div>
        )}
        {(page > 1 || hasNext) && <Pagination page={page} hasNext={hasNext} href={href} className="mt-6" />}
      </div>
    </>
  );
}

/** Une pastille par canal de capture ; celle en retard (plus de 24 h) passe en avertissement, avec son icône. */
function Channels({ channels }: { channels: ChannelStatus[] }) {
  return (
    <ul aria-label="Canaux de capture" className="flex flex-wrap gap-2">
      {channels.map((c) => (
        <li
          key={c.channel}
          className={cn(
            // la pastille passe à la ligne plutôt que de couper l'heure de capture (320 px)
            'inline-flex min-h-9 max-w-full min-w-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-3 text-label shadow-hi max-sm:rounded-[18px]',
            c.late ? 'border-warning-line bg-warning-soft text-warning' : 'border-line bg-glass-3 text-fg-2',
          )}
        >
          {c.late ? <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.8} /> : <ToolIcon kind={c.channel} />}
          <span className="min-w-0">
            <span className={cn('font-semibold', !c.late && 'text-fg')}>{c.label}</span>
            {c.text.slice(c.label.length)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// top-14 : sous la barre mobile (56 px) tant que la page défile ; dans le panneau, en haut
const TH = 'sticky top-14 z-[2] h-10 shell:top-0 border-b border-line glass-float px-4 text-left align-middle text-label font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5';
// align-top : sur une ligne à deux étages (titre + « Ouvrir dans … »), tout s'aligne sur la première ligne du titre
const TD = 'px-4 py-3 align-top first:pl-5 last:pr-5';

/** Tableau (conteneur ≥ 768 px) : en-tête collant, survol de ligne. */
function Table({ rows, openError }: { rows: SourceRow[]; openError: boolean }) {
  const firstFailed = rows.findIndex((r) => r.indexing === 'failed');
  return (
    // overflow-clip (et non hidden) : la carte arrondit et rogne sans devenir un conteneur de défilement, l'en-tête colle au panneau
    <GlassCard className="overflow-clip @max-3xl:hidden">
      <table className="w-full border-separate border-spacing-0 text-ui">
        <thead>
          <tr>
            <th scope="col" className={cn(TH, 'w-[150px]')}>Origine</th>
            <th scope="col" className={TH}>Titre</th>
            <th scope="col" className={cn(TH, 'w-[132px]')}>Dernier tour</th>
            <th scope="col" className={cn(TH, 'w-[84px] text-right')}>Tours</th>
            <th scope="col" className={cn(TH, 'w-[168px]')}>Indexation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="transition-colors duration-200 hover:bg-hover focus-within:bg-hover [&:not(:first-child)>td]:border-t [&:not(:first-child)>td]:border-line">
              <td className={TD}><SourceChip kind={r.kind} label={r.kindLabel} /></td>
              <td className={TD}><Title row={r} /></td>
              <td className={TD}><LastTurn at={r.lastTurnAt} /></td>
              <td className={cn(TD, 'text-right font-mono text-[12.5px] tracking-normal text-fg-2')}>{formatNumber(r.turns)}</td>
              <td className={TD}><Indexing status={r.indexing} open={openError && i === firstFailed} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

/** Sous 768 px de conteneur : chaque ligne devient une carte empilée (aucun défilement horizontal). */
function Cards({ rows, openError }: { rows: SourceRow[]; openError: boolean }) {
  const firstFailed = rows.findIndex((r) => r.indexing === 'failed');
  return (
    <ul className="grid gap-2 @3xl:hidden">
      {rows.map((r, i) => (
        <li key={r.id} className="grid gap-2.5 rounded-card border border-line bg-panel px-4 py-3.5 shadow-hi">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <SourceChip kind={r.kind} label={r.kindLabel} className="pt-0.5" />
            <div className="shrink-0 text-right"><Indexing status={r.indexing} open={openError && i === firstFailed} /></div>
          </div>
          <Title row={r} />
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-label">
            <div className="flex items-baseline gap-1.5"><dt className="text-muted">Dernier tour</dt><dd><LastTurn at={r.lastTurnAt} /></dd></div>
            <div className="flex items-baseline gap-1.5"><dt className="text-muted">Tours</dt><dd className="font-mono text-[12.5px] tracking-normal text-fg-2">{formatNumber(r.turns)}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Title({ row }: { row: SourceRow }) {
  return (
    <div className="min-w-0">
      {row.title ? <p className="font-medium text-fg [overflow-wrap:anywhere]">{row.title}</p> : <p className="text-muted">Sans titre</p>}
      {row.url && (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="group/l inline-flex min-h-6 items-center gap-1 rounded-sm text-label text-muted transition-colors hover:text-accent"
        >
          Ouvrir dans {row.kindLabel}
          <ExternalLink aria-hidden="true" strokeWidth={1.7} className="size-3 transition-transform duration-200 group-hover/l:translate-x-px group-hover/l:-translate-y-px" />
        </a>
      )}
    </div>
  );
}

/** « il y a 4 min », la date complète en infobulle (et lue par les lecteurs d'écran), ou « — ». */
function LastTurn({ at }: { at: Date | null }) {
  if (!at) return <span className="text-[12.5px] text-muted">—</span>;
  return (
    <Tooltip content={formatDateTime(at)}>
      <time dateTime={at.toISOString()} className="text-[12.5px] tabular-nums whitespace-nowrap text-fg-2">
        {formatRelative(at)}
        <span className="sr-only">, {formatDateTime(at)}</span>
      </time>
    </Tooltip>
  );
}

/** Indexation : badge ; « Erreur » se déplie sur « Échec de l’indexation. » ; « — » lu « Pas encore indexée ». */
function Indexing({ status, open }: { status: IndexingStatus | null; open?: boolean }) {
  if (!status)
    return (
      <>
        <span aria-hidden="true" className="font-mono text-[12.5px] tracking-normal text-muted">—</span>
        <span className="sr-only">Pas encore indexée</span>
      </>
    );
  if (status === 'running') return <StatusBadge status="running" />;
  // « Indexée » est le cas courant : il reste discret pour que « En cours » et « Erreur » ressortent (même icône, même mot)
  if (status === 'done')
    return (
      <span className="inline-flex h-5 items-center gap-1 px-2 text-[11px] font-medium whitespace-nowrap text-muted">
        <CircleCheck aria-hidden="true" className="size-3" strokeWidth={1.8} />
        Indexée
      </span>
    );
  return (
    <Collapsible defaultOpen={open} data-erreur-ouverte={open || undefined}>
      <CollapsibleTrigger className="group -my-0.5 inline-flex min-h-6 items-center gap-1 rounded-full py-0.5">
        <StatusBadge status="failed" className="transition-[box-shadow] group-hover:shadow-[inset_0_0_0_1px_var(--destructive)]" />
        <ChevronDown aria-hidden="true" strokeWidth={1.8} className="size-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pt-1.5 text-label text-destructive">Échec de l’indexation.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
