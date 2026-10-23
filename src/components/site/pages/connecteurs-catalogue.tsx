'use client';

import { KeyRound, ListFilter, MousePointerClick, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Pill } from '@/components/verre/ui/pill';
import { FAMILY_LABELS, type ProviderFamily } from '@/lib/providers';
import { nb } from '@/lib/verre/nb';
import { fold } from '@/lib/verre/text';
import { ALL_TOOLS, TOOL_GROUPS, toolLabel } from '../content';
import { ToolLogo } from '../parts';

// Catalogue des outils branchables : filtre par famille (pastilles) et par nom (champ), sans recharger la page.
// Les outils qui ont un bouton « Se connecter avec… » : ceux qui ont une appli OAuth (src/server/connectors/*/catalog.ts).

const OAUTH = new Set<ProviderId>([
  'airtable',
  'asana',
  'attio',
  'basecamp',
  'clickup',
  'confluence',
  'github',
  'gitlab',
  'helpscout',
  'hubspot',
  'jira',
  'linear',
  'miro',
  'monday',
  'notion',
  'outlook',
  'productboard',
]);

const FAMILY_OF = new Map<ProviderId, ProviderFamily>(
  TOOL_GROUPS.flatMap((g) => g.tools.map((id) => [id, g.family] as const)),
);

type Filter = 'tous' | ProviderFamily;

export function ConnecteursCatalogue() {
  const [family, setFamily] = useState<Filter>('tous');
  const [query, setQuery] = useState('');
  const inputId = useId();

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return ALL_TOOLS.filter(
      (id) =>
        (family === 'tous' || FAMILY_OF.get(id) === family) &&
        (q === '' || fold(toolLabel(id)).includes(q)),
    );
  }, [family, query]);

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <fieldset className="min-w-0">
          <legend className="sr-only">Famille d’outils</legend>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <Pill
              variant={family === 'tous' ? 'active' : 'default'}
              aria-pressed={family === 'tous'}
              onClick={() => setFamily('tous')}
            >
              Tous
              <span className="font-mono text-[11px] opacity-80">{ALL_TOOLS.length}</span>
            </Pill>
            {TOOL_GROUPS.map((g) => (
              <Pill
                key={g.family}
                variant={family === g.family ? 'active' : 'default'}
                aria-pressed={family === g.family}
                onClick={() => setFamily(g.family)}
              >
                {g.label}
                <span className="font-mono text-[11px] opacity-80">{g.tools.length}</span>
              </Pill>
            ))}
          </div>
        </fieldset>
        <div className="relative w-full lg:w-[280px]">
          <label htmlFor={inputId} className="sr-only">
            Filtrer les outils par nom
          </label>
          <ListFilter
            aria-hidden="true"
            strokeWidth={1.7}
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer par nom…"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-full border border-line-strong bg-glass-2 pr-10 pl-10 text-ui text-fg shadow-hi outline-none transition-[border-color,box-shadow] duration-200 pointer-coarse:text-title focus-visible:border-accent-line focus-visible:shadow-[inset_0_1px_0_var(--hi),0_0_0_3px_var(--accent-soft)]"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Effacer le filtre"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 inline-grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <X aria-hidden="true" strokeWidth={1.8} className="size-4" />
            </button>
          )}
        </div>
      </div>

      <p role="status" className="mt-5 font-mono text-meta tracking-normal text-muted">
        {shown.length === 0
          ? 'Aucun outil ne correspond'
          : `${shown.length} outil${shown.length > 1 ? 's' : ''}${family === 'tous' ? '' : ` · ${FAMILY_LABELS[family]}`}`}
      </p>

      {shown.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((id) => {
            const fam = FAMILY_OF.get(id);
            const oauth = OAUTH.has(id);
            return (
              <li
                key={id}
                className="fade-in group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-box border border-line bg-panel p-3 shadow-hi sm:flex-col sm:items-start sm:gap-4 sm:p-4 transition-[border-color,translate] duration-300 ease-out hover:-translate-y-0.5 hover:border-line-strong"
              >
                <ToolLogo id={id} size={44} className="max-sm:size-9!" />
                <div className="min-w-0 flex-1 sm:flex-none">
                  <p className="truncate text-ui font-semibold text-fg">{toolLabel(id)}</p>
                  <p className="mt-0.5 font-mono text-meta tracking-normal text-muted">
                    {fam ? FAMILY_LABELS[fam] : ''}
                  </p>
                </div>
                <p className="inline-flex items-center gap-1.5 text-label text-fg-2 max-sm:absolute max-sm:top-2 max-sm:right-2 sm:mt-auto">
                  {oauth ? (
                    <MousePointerClick
                      aria-hidden="true"
                      strokeWidth={1.7}
                      className="size-3.5 text-accent"
                    />
                  ) : (
                    <KeyRound
                      aria-hidden="true"
                      strokeWidth={1.7}
                      className="size-3.5 text-accent"
                    />
                  )}
                  <span className="max-sm:sr-only">
                    {oauth ? 'Bouton de connexion' : 'Clé d’API'}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-box border border-line bg-panel px-6 py-12 text-center shadow-hi">
          <p className="text-ui font-semibold text-fg">
            {nb(`Aucun outil ne s’appelle « ${query.trim()} ».`)}
          </p>
          <p className="mt-1.5 text-body text-muted">
            {nb('Vérifiez l’orthographe, ou regardez ce qui est prévu plus bas.')}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFamily('tous');
            }}
            className="mt-5 inline-flex h-9 items-center rounded-full border border-line-strong bg-glass-3 px-4 text-ui font-semibold text-fg transition-colors hover:bg-hover"
          >
            Voir tous les outils
          </button>
        </div>
      )}
    </div>
  );
}
