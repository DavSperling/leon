'use client';

import { ExternalLink } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { type PreviewResult, previewPassageAction } from '@/app/(app)/actions';
import { citationDetailsAction } from '@/app/(app)/discussions/actions';
import { highlightTerms } from '@/components/search/highlighted-text';
import type { PreviewView } from '@/components/search/view-model';
import {
  Button,
  Fact,
  Facts,
  Highlighted,
  Notice,
  OriginalSheet,
  PanelClose,
  SidePanel,
  Skeleton,
  ToolLogo,
} from '@/components/verre';
import type { SourceVisibility } from '@/lib/discussion-events';
import { markdownPlain } from '@/lib/markdown';
import { cn, formatDateTime } from '@/lib/verre';
import { type Part, passageBlocks, passageParts } from './passage-parts';

// L'original d'une source, dans le panneau latéral : ouvert depuis un numéro ou une tuile de source (discussion, réponse
// de la recherche, point du matin). Ses mots en sérif, le passage cité marqué dans la couleur de la source et amené en
// vue, qui la voit, et « Ouvrir dans <outil> ». Lu sous les droits du lecteur (previewPassageAction) ; une source qu'il
// ne voit plus est « introuvable ». Le panneau est modal : un clic dehors le ferme seulement, Échap aussi, et le focus
// revient au numéro ou à la tuile qui l'a ouvert.

export type PanelSource = {
  /** Son numéro dans la réponse : la couleur du drapeau et du passage. */
  n: number;
  passageId: string;
  title: string | null;
  url: string | null;
  kind?: string;
  visibility?: SourceVisibility;
  /** Le texte du passage cité, quand l'écran l'a déjà (citationDetails) : il est marqué dans son tour. */
  passage?: string;
  /** Les phrases de la réponse qui citent cette source : seuls les mots qu'elles lui ont pris sont marqués. */
  used?: string[];
  /** Les autres passages trouvés de la même source (un résultat de la recherche) : on passe de l'un à l'autre. */
  others?: Array<{ passageId: string; snippet: string; authorName: string | null; ts: Date }>;
};

type Loaded =
  | { status: 'charge' | 'introuvable' | 'erreur' }
  | { status: 'pret'; preview: PreviewView };

/** Le panneau d'une source : `open(source, opener)` l'ouvre ; `panel` est à poser une fois dans l'écran. */
export function useSourcePanel({ terms = [] }: { terms?: string[] } = {}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PanelSource | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'charge' });
  const latest = useRef(0);

  const show = (next: PanelSource) => {
    const request = ++latest.current;
    setSource(next);
    setLoaded({ status: 'charge' });
    setOpen(true);
    // ce que la citation ne dit pas encore (le passage cité, qui la voit) est relu avec le texte de la source
    const details =
      next.visibility && next.passage !== undefined
        ? Promise.resolve(null)
        : citationDetailsAction([next.passageId]).catch(() => null);
    Promise.all([previewPassageAction(next.passageId), details])
      .then(([answer, found]: [PreviewResult, Awaited<typeof details>]) => {
        if (request !== latest.current) return;
        const more = found?.[next.passageId.toLowerCase()];
        if (more) setSource({ ...next, ...more, passage: next.passage ?? more.passage });
        setLoaded(
          answer.ok ? { status: 'pret', preview: answer.preview } : { status: answer.reason },
        );
      })
      .catch(() => {
        if (request === latest.current) setLoaded({ status: 'erreur' });
      });
  };

  const panel = source ? (
    <SourcePanelView
      open={open}
      onOpenChange={(next) => {
        if (!next) latest.current += 1;
        setOpen(next);
      }}
      source={source}
      loaded={loaded}
      terms={terms}
      onPick={(passageId) => show({ ...source, passageId, passage: undefined })}
    />
  ) : null;

  return { open: show, opened: open ? source : null, panel };
}

/** Des morceaux de texte : les mots repris sous le trait de la source, le début du passage repéré. */
const marks = (parts: Part[]): ReactNode =>
  parts.map((part, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
    <Fragment key={i}>
      {part.hit ? (
        <mark>{part.text}</mark>
      ) : part.anchor ? (
        <span data-anchor>{part.text}</span>
      ) : (
        part.text
      )}
    </Fragment>
  ));

/**
 * Le texte d'un tour : ses paragraphes, et ses listes et tableaux dessinés comme tels (une page Notion arrive avec ses
 * barres et ses tirets). Un tour voisin du passage (`clamp`) est coupé à six lignes.
 */
function TurnText({ parts, clamp }: { parts: Part[]; clamp: boolean }) {
  const all = passageBlocks(parts);
  if (all.every((block) => block.type === 'p'))
    return (
      <p className={cn('mt-1.5 whitespace-pre-wrap', clamp && 'line-clamp-6')}>{marks(parts)}</p>
    );
  // Un tour voisin du passage se coupe entre deux lignes, jamais au milieu d'une : ses deux premiers blocs, trois lignes
  // d'un tableau, quatre d'une liste, puis « … ».
  const blocks = clamp
    ? all
        .slice(0, 2)
        .map((block) =>
          block.type === 'table'
            ? { ...block, rows: block.rows.slice(0, 3) }
            : block.type === 'list'
              ? { ...block, items: block.items.slice(0, 4) }
              : block,
        )
    : all;
  const cut =
    clamp &&
    (all.length > blocks.length ||
      blocks.some((block, i) => {
        const whole = all[i];
        return (
          (block.type === 'table' && whole?.type === 'table' && whole.rows.length > 3) ||
          (block.type === 'list' && whole?.type === 'list' && whole.items.length > 4)
        );
      }));
  // des morceaux d'un texte figé, dans l'ordre : leur rang est leur clé
  const keyed = <T,>(items: T[]) => items.map((item, i) => ({ item, key: `k${i}` }));
  return (
    <div className="mt-1.5 grid gap-2.5 [&>p]:mt-0">
      {keyed(blocks).map(({ item: block, key }) => {
        if (block.type === 'p')
          return (
            <p key={key} className={cn('whitespace-pre-wrap', clamp && 'line-clamp-3')}>
              {marks(block.parts)}
            </p>
          );
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={key}
              className={cn('doc-list', block.ordered ? 'list-decimal' : 'list-disc')}
            >
              {keyed(block.items).map((li) => (
                <li key={li.key}>{marks(li.item)}</li>
              ))}
            </List>
          );
        }
        return (
          // un tableau large défile dans sa feuille, jamais la page
          <div key={key} className="overflow-x-auto">
            <table className="doc-table">
              {block.head && (
                <thead>
                  <tr>
                    {keyed(block.head).map((cell) => (
                      <th key={cell.key} scope="col">
                        {marks(cell.item)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {keyed(block.rows).map((row) => (
                  <tr key={row.key}>
                    {keyed(row.item).map((cell) => (
                      <td key={cell.key}>{marks(cell.item)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {cut && (
        <p aria-hidden="true" className="text-muted">
          …
        </p>
      )}
    </div>
  );
}

function SourcePanelView({
  open,
  onOpenChange,
  source,
  loaded,
  terms,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PanelSource;
  loaded: Loaded;
  terms: string[];
  onPick: (passageId: string) => void;
}) {
  const t = useTranslations('discussionView');
  const common = useTranslations('common');
  const locale = useLocale();
  const preview = loaded.status === 'pret' ? loaded.preview : null;
  const kind = preview?.kind ?? source.kind ?? 'other';
  const title = preview?.title?.trim() || source.title?.trim() || t('untitled');
  const url = preview?.url ?? source.url;
  const sub = preview
    ? [preview.kindLabel, preview.natureLabel, preview.originLabel].filter(Boolean).join(' · ')
    : undefined;
  const body = useRef<HTMLDivElement>(null);

  // Le tour du passage se place en haut du corps, avec un peu du tour d'avant au-dessus.
  useEffect(() => {
    if (!preview) return;
    const frame = requestAnimationFrame(() => {
      const box = body.current?.closest<HTMLElement>('[data-panel-body]');
      // le premier mot marqué du tour, sinon le début du passage (rien de repris), sinon le tour : un long tour ne cache
      // pas son passage sous le pli
      const hit =
        body.current?.querySelector<HTMLElement>('[data-hit] mark') ??
        body.current?.querySelector<HTMLElement>('[data-hit] [data-anchor]') ??
        body.current?.querySelector<HTMLElement>('[data-hit]');
      if (!box || !hit) return;
      box.scrollTop +=
        hit.getBoundingClientRect().top -
        box.getBoundingClientRect().top -
        (hit.tagName === 'DIV' ? 72 : 132);
    });
    return () => cancelAnimationFrame(frame);
  }, [preview]);

  const others = (source.others ?? []).filter((other) => other.passageId !== source.passageId);
  let content: ReactNode;
  if (preview === null && loaded.status === 'charge')
    content = (
      <div role="status" className="grid gap-2.5">
        <span className="sr-only">{t('loadingPreview')}</span>
        <Skeleton className="h-16 rounded-item" />
        <Skeleton className="h-28 rounded-item" />
        <Skeleton className="h-16 rounded-item" />
      </div>
    );
  else if (loaded.status === 'introuvable')
    content = (
      <Notice tone="warning" live="alert">
        {t('passageUnavailable')}
      </Notice>
    );
  else if (preview === null)
    content = (
      <Notice tone="error" live="alert">
        {t('previewFailed')}
      </Notice>
    );
  else
    content = (
      <div ref={body}>
        <OriginalSheet n={source.n}>
          {preview.turns.map((turn) => {
            const parts: Part[] = turn.isHit
              ? passageParts(turn.text, source.passage, terms, source.used)
              : highlightTerms(markdownPlain(turn.text), terms);
            return (
              <div key={turn.turnId} data-hit={turn.isHit || undefined} className="[&+&]:mt-5">
                <p className="font-sans text-label text-muted">
                  {turn.speaker} ·{' '}
                  <time dateTime={new Date(turn.ts).toISOString()}>
                    {formatDateTime(new Date(turn.ts), locale)}
                  </time>
                  {turn.isHit && <span className="sr-only"> · {t('matchingPassage')}</span>}
                </p>
                <TurnText parts={parts} clamp={!turn.isHit} />
              </div>
            );
          })}
        </OriginalSheet>
        {source.visibility && (
          <Facts className="mt-5">
            <Fact label={t('visibleTo')}>{t(`visibility.${source.visibility}`)}</Fact>
          </Facts>
        )}
        {others.length > 0 && (
          <section className="mt-6">
            <h3 className="text-label font-medium text-muted">{t('otherPassages')}</h3>
            <ul className="mt-2 grid gap-1">
              {others.map((other) => (
                <li key={other.passageId}>
                  <button
                    type="button"
                    onClick={() => onPick(other.passageId)}
                    className="-mx-2 w-[calc(100%+16px)] rounded-item px-2 py-2 text-left text-ui leading-[1.5] text-fg transition-colors duration-150 hover:bg-hover"
                  >
                    <span className="line-clamp-3">
                      <Highlighted text={other.snippet} />
                    </span>
                    <span className="mt-0.5 block text-label text-muted">
                      {[other.authorName, formatDateTime(other.ts, locale)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<ToolLogo kind={kind} size={44} />}
      title={title}
      sub={sub || undefined}
      foot={
        <>
          {url && (
            <Button asChild variant="secondary" icon={ExternalLink}>
              <a href={url} target="_blank" rel="noreferrer">
                {preview?.kindLabel
                  ? t('openIn', { tool: preview.kindLabel })
                  : t('openOriginalLabel')}
              </a>
            </Button>
          )}
          <PanelClose asChild>
            <Button variant="secondary" className="ml-auto">
              {common('done')}
            </Button>
          </PanelClose>
        </>
      }
    >
      {content}
    </SidePanel>
  );
}
