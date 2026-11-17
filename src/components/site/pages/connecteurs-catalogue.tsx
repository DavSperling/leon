'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import type { ProviderFamily } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { fold } from '@/lib/verre/text';
import { TOOL_GROUPS, toolLabel, useSiteContent } from '../content';
import { ToolLogo, tone } from '../parts';

// Catalogue des outils branchables : à gauche, le champ et l'index des familles (il reste en vue) ; à droite, une ligne
// par outil (ce que Leon en lit, et comment on le branche). Le filtre cherche dans le nom, la famille et ce qui est lu.
// Les outils qui ont un bouton « Se connecter avec… » : ceux qui ont une appli OAuth (src/server/connectors/*/catalog.ts).

const OAUTH = new Set<ProviderId>([
  'airtable',
  'asana',
  'attio',
  'basecamp',
  'clickup',
  'confluence',
  'drive',
  'github',
  'gitlab',
  'gmail',
  'helpscout',
  'hubspot',
  'jira',
  'linear',
  'miro',
  'monday',
  'notion',
  'outlook',
  'productboard',
  'slack',
]);

const FAMILY_OF = new Map<ProviderId, ProviderFamily>(
  TOOL_GROUPS.flatMap((g) => g.tools.map((id) => [id, g.family] as const)),
);

type Filter = 'tous' | ProviderFamily;

export function ConnecteursCatalogue() {
  const t = useTranslations('site.catalogue');
  const { toolGroups, familyLabels, reads } = useSiteContent();
  const [family, setFamily] = useState<Filter>('tous');
  const [query, setQuery] = useState('');
  const inputId = useId();

  const q = fold(query.trim());
  const matches = (id: ProviderId) => {
    if (q === '') return true;
    const f = FAMILY_OF.get(id);
    return fold(`${toolLabel(id)} ${f ? familyLabels[f] : ''} ${reads[id]}`).includes(q);
  };
  const groups = toolGroups
    .filter((g) => family === 'tous' || g.family === family)
    .map((g) => ({ ...g, tools: g.tools.filter(matches) }))
    .filter((g) => g.tools.length > 0);
  const shown = groups.reduce((n, g) => n + g.tools.length, 0);
  // Les outils au bon nom, toutes familles : l'état vide dit si c'est la famille choisie qui les cache.
  const elsewhere =
    family !== 'tous' && q !== '' ? toolGroups.flatMap((g) => g.tools.filter(matches)) : [];
  const hiddenByFamily = shown === 0 && elsewhere.length > 0;

  return (
    <div className="s-grid s-cat">
      <div className="s-cat__aside">
        <label htmlFor={inputId} className="sr-only">
          {t('filterLabel')}
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder={t('filterPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className="s-field [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label={t('clear')}
              onClick={() => setQuery('')}
              className="s-icon-btn absolute top-1/2 right-1 size-9 -translate-y-1/2"
            >
              <X aria-hidden="true" strokeWidth={1.8} className="size-4" />
            </button>
          )}
        </div>
        <p role="status" className="s-small mt-3 min-h-5">
          {shown === 0
            ? t('none')
            : `${t('count', { count: shown })}${family === 'tous' ? '' : ` · ${familyLabels[family]}`}`}
        </p>
        <fieldset className="s-index mt-6">
          <legend className="sr-only">{t('family')}</legend>
          <ul>
            <li>
              <button
                type="button"
                aria-pressed={family === 'tous'}
                onClick={() => setFamily('tous')}
              >
                <span>{t('all')}</span>
              </button>
            </li>
            {toolGroups.map((g) => (
              <li key={g.family}>
                <button
                  type="button"
                  aria-pressed={family === g.family}
                  onClick={() => setFamily(g.family)}
                >
                  <span>{g.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <p className="s-small mt-6 max-[1099px]:hidden">{nb(t('legend'))}</p>
      </div>

      <div className="s-cat__list">
        {groups.length > 0 ? (
          groups.map((g) => (
            <section
              key={g.family}
              aria-labelledby={`fam-${g.family}`}
              // la couleur de la famille : celle de son drapeau et du surligneur qui passe sur ses lignes
              className={cn('s-fam', tone(toolGroups.findIndex((x) => x.family === g.family) + 1))}
            >
              <h3 id={`fam-${g.family}`} className="s-h3 mb-3 flex items-center gap-3">
                {g.label}
                <span aria-hidden="true" data-pm="pop" className="flag">
                  {g.tools.length}
                </span>
              </h3>
              <ul className="s-rows">
                {g.tools.map((id) => (
                  <li key={id} className="s-row">
                    <ToolLogo id={id} size={24} />
                    <span className="font-medium">{toolLabel(id)}</span>
                    <span className="text-muted">
                      <span className="pg-read">{nb(reads[id])}</span>
                    </span>
                    <span className="s-row__how">{OAUTH.has(id) ? t('oauth') : t('apiKey')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <div className="border-y border-line py-12">
            {hiddenByFamily && family !== 'tous' ? (
              <>
                <p className="s-h3">
                  {nb(t('hiddenTitle', { query: query.trim(), family: familyLabels[family] }))}
                </p>
                <p className="s-body mt-1.5 text-muted">
                  {nb(
                    t('hiddenElsewhere', {
                      tools: elsewhere
                        .map((id) => {
                          const f = FAMILY_OF.get(id);
                          return f ? `${toolLabel(id)} (${familyLabels[f]})` : toolLabel(id);
                        })
                        .join(', '),
                    }),
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="s-h3">{nb(t('noneTitle', { query: query.trim() }))}</p>
                <p className="s-body mt-1.5 text-muted">{nb(t('noneHint'))}</p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                // la famille cache les bons outils : on la lève, la recherche reste
                if (!hiddenByFamily) setQuery('');
                setFamily('tous');
              }}
              className="s-btn s-btn--line s-btn--sm mt-6"
            >
              {hiddenByFamily ? t('searchAll') : t('showAll')}
            </button>
          </div>
        )}
        <p className="s-small mt-6 min-[1100px]:hidden">{nb(t('legend'))}</p>
      </div>
    </div>
  );
}
