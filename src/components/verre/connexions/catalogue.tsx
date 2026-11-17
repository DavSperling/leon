'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import {
  Button,
  EmptyState,
  type FlagTone,
  Pill,
  SearchField,
  Section,
  Thing,
  ThingGrid,
  ToolLogo,
} from '@/components/verre';
import { canReconnect } from '@/lib/connection-form';
import { PROVIDER_FAMILIES_ORDER, type ProviderFamily } from '@/lib/providers';
import { cn, nb } from '@/lib/verre';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { type GroupOption, usePartageLabel } from '../documents/partage';
import { cardOf, connectedTools, matchTool, recommendedToConnect, scopeOf } from './model';

/*
 * Le bureau de Connexions : « Branchés » (une carte par outil : son nom, qui voit, ou ce qui ne va pas), puis « Ajouter
 * un outil » (une tuile par outil libre, les conseillés pour le poste en tête, légendés « Conseillé » ; les familles en
 * puces, la recherche). Ni compteur, ni date, ni description sur un rectangle : le reste est dans le panneau de l'outil.
 * Ce qu'on a est une feuille (le logo sur sa pastille, un point d'état) ; ce qu'on peut ajouter est imprimé sur le
 * bureau et ne dit « Brancher » que pointé (connexions.css).
 */

// Une connexion toute neuve qui n'a pas encore été relevée : « Lecture… ». Au-delà, la relève est en retard, pas en cours.
const FIRST_READ_MS = 10 * 60_000;

/** Le logo d'une carte, sur sa pastille ; `dot` : le point d'état (vert, ou l'anneau vide d'une pause). */
const Well = ({ id, dot }: { id: string; dot?: boolean }) => (
  <span className="cx-well">
    <ToolLogo kind={id} size={32} />
    {dot && <span className="cx-dot" />}
  </span>
);

// Le trait qui passe sous un nom pointé, par famille.
const HL: FlagTone[] = [1, 2, 3, 4, 1, 2];
const hlOf = (p: CatalogItem) => HL[PROVIDER_FAMILIES_ORDER.indexOf(p.family)] ?? 4;

/** Un outil sans connecteur : une tuile qui n'est pas un contrôle, « Bientôt ». */
function SoonTile({ p }: { p: CatalogItem }) {
  const t = useTranslations('connections');
  return (
    <div className="tl tile cx-add cx-soon pointer-events-none">
      <span className="tl__pic">
        <ToolLogo kind={p.id} size={28} />
      </span>
      <span className="tl__id">
        <span className="tl__name">{p.label}</span>
        <span className="tl__sub">{t('soon')}</span>
      </span>
    </div>
  );
}

export function Catalogue({
  catalog,
  recommended,
  conns,
  viewerId,
  canConnect,
  groups,
  now,
  fresh,
  onOpen,
}: {
  catalog: CatalogItem[];
  /** Les outils du service de la personne : ceux qu'il lui reste à brancher ouvrent « Ajouter un outil ». */
  recommended: ProviderId[];
  conns: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  groups: GroupOption[];
  /** L'heure de la page : une connexion toute neuve, pas encore relevée, dit « Lecture… ». */
  now?: Date;
  /** Les outils branchés depuis que la page est ouverte : le trait vert passe une fois sous leur nom. */
  fresh?: ReadonlySet<ProviderId>;
  onOpen: (id: ProviderId) => void;
}) {
  const t = useTranslations('connections');
  const scopeLabel = usePartageLabel(groups);
  // Une famille à la fois ; null : toutes. Se combine avec les lettres du champ. Le filtre ne touche que les tuiles.
  const [family, setFamily] = useState<ProviderFamily | null>(null);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const families = PROVIDER_FAMILIES_ORDER.filter((id) => catalog.some((p) => p.family === id));
  const match = (p: CatalogItem) => matchTool(p, family, query, t(`family.${p.family}`));
  const filtering = Boolean(query.trim()) || family !== null;

  const connected = connectedTools(catalog, conns);
  // Un outil qui a déjà sa carte (même celle d'un collègue, en panne) ne se propose pas une seconde fois : son panneau
  // offre « Brancher un autre compte ».
  const advised = recommendedToConnect(catalog, conns, recommended).filter(
    (p) => !connected.some((c) => c.id === p.id),
  );
  // les conseillés d'abord, puis le reste du catalogue ; le filtre les traite tous pareil
  const all = [
    ...advised,
    ...catalog.filter(
      (p) => !conns.some((c) => c.provider === p.id) && !advised.some((a) => a.id === p.id),
    ),
  ];
  // Rien de branché : les quatre premiers outils à brancher prennent la place des cartes (des places libres, la
  // première porte la pastille d'encre) ; ils ne sont pas répétés dessous, sauf quand on cherche.
  const slots = connected.length === 0 ? all.filter((p) => p.available).slice(0, 4) : [];
  const free = all.filter(match).filter((p) => filtering || !slots.includes(p));
  // des lettres qui ne trouvent qu'un outil déjà branché : on le dit, et on y mène
  const known = filtering && free.length === 0 ? connected.filter(match) : [];
  const shown = free.length;

  // La pastille d'encre de la vue : « Reconnecter » sur la première carte en panne que la personne peut réparer.
  let inkGiven = false;
  const cards = connected.map((p) => {
    const mine = conns.filter((c) => c.provider === p.id);
    const card = cardOf(mine, viewerId);
    if (!card) return null;
    const { conn } = card;
    const fixable = card.reconnect && canConnect && (!canReconnect(conn) || p.oauthReady);
    const ink = fixable && !inkGiven;
    if (ink) inkGiven = true;
    const scope = scopeOf(conn, p.privateRaw);
    const caption =
      card.caption === 'scope'
        ? scope === 'equipe'
          ? t('team')
          : scope === 'moi'
            ? conn.isCreator
              ? t('onlyYou')
              : t('onlyName', { name: conn.createdBy.name })
            : scopeLabel(scope)
        : t(
            card.caption === 'paused'
              ? 'statusPaused'
              : card.caption === 'stopped'
                ? 'statusStopped'
                : card.caption,
          );
    const error = card.caption !== 'scope' && card.caption !== 'paused';
    const paused = card.caption === 'paused';
    const reading =
      card.caption === 'scope' &&
      conn.status === 'active' &&
      !conn.lastSyncAt &&
      now !== undefined &&
      now.getTime() - conn.createdAt.getTime() < FIRST_READ_MS;
    return (
      <Thing
        key={p.id}
        size="card"
        className={cn('cx-card', paused && 'is-paused', fresh?.has(p.id) && 'cx-fresh')}
        picture={<Well id={p.id} dot={!error} />}
        name={p.label}
        caption={reading ? t('firstRead') : nb(caption)}
        working={reading}
        error={error}
        pill={fixable ? t('reconnect') : undefined}
        pillInk={ink}
        hl={hlOf(p)}
        label={t(fixable ? 'reconnectTool' : 'manageTool', { provider: p.label })}
        data-outil={p.id}
        onClick={() => onOpen(p.id)}
      />
    );
  });

  const tile = (p: CatalogItem) =>
    p.available ? (
      <Thing
        key={p.id}
        picture={<ToolLogo kind={p.id} size={28} />}
        name={p.label}
        className="cx-add"
        caption={advised.includes(p) ? t('recommended') : undefined}
        pill={
          <>
            <Plus aria-hidden="true" strokeWidth={1.8} />
            <span className="cx-add__word">
              <span>{t('connect')}</span>
            </span>
          </>
        }
        hl={hlOf(p)}
        label={t('connectTool', { provider: p.label })}
        data-outil={p.id}
        onClick={() => onOpen(p.id)}
      />
    ) : (
      <SoonTile key={p.id} p={p} />
    );

  const clear = () => {
    setQuery('');
    setFamily(null);
    search.current?.focus();
  };

  return (
    <>
      <Section id="branches" title={t('connected')} count={connected.length || undefined} tone={2}>
        {connected.length > 0 ? (
          <ThingGrid>{cards}</ThingGrid>
        ) : (
          <>
            <p className="mb-3 text-lead text-muted">{t('noneConnected')}</p>
            <ThingGrid>
              {slots.map((p, i) => (
                <Thing
                  key={p.id}
                  size="card"
                  className="cx-card cx-slot"
                  picture={<Well id={p.id} />}
                  name={p.label}
                  caption={advised.includes(p) ? t('recommended') : undefined}
                  pill={t('connect')}
                  pillInk={i === 0 && canConnect}
                  hl={hlOf(p)}
                  label={t('connectTool', { provider: p.label })}
                  data-outil={p.id}
                  onClick={() => onOpen(p.id)}
                />
              ))}
            </ThingGrid>
          </>
        )}
      </Section>

      <Section
        id="a-brancher"
        title={t('toConnect')}
        // pas de drapeau : le nombre d'outils du catalogue ne dit rien à qui cherche le sien
        actions={
          <SearchField
            ref={search}
            label={t('filter')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              }
            }}
          />
        }
      >
        {/* biome-ignore lint/a11y/useSemanticElements: un groupe de boutons bascule, pas un formulaire (fieldset) */}
        <div role="group" aria-label={t('families')} className="mb-4 flex flex-wrap gap-2">
          <Pill aria-pressed={family === null} onClick={() => setFamily(null)}>
            {t('all')}
          </Pill>
          {families.map((id) => (
            <Pill
              key={id}
              aria-pressed={family === id}
              // un second clic sur la famille choisie revient à tous les outils
              onClick={() => setFamily(family === id ? null : id)}
            >
              {t(`family.${id}`)}
            </Pill>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {filtering
            ? known.length
              ? known.map((p) => t('alreadyConnected', { provider: p.label })).join(' ')
              : t('count', { count: shown })
            : ''}
        </p>
        {free.length > 0 && <ThingGrid>{free.map(tile)}</ThingGrid>}
        {known.length > 0 && (
          <ThingGrid>
            {known.map((p) => (
              <Thing
                key={p.id}
                picture={<ToolLogo kind={p.id} size={28} />}
                name={p.label}
                caption={t('alreadyHere')}
                pill={t('manage')}
                hl={hlOf(p)}
                label={t('manageTool', { provider: p.label })}
                onClick={() => onOpen(p.id)}
              />
            ))}
          </ThingGrid>
        )}
        {filtering && shown === 0 && known.length === 0 && (
          <EmptyState
            title={
              query.trim()
                ? t('noMatchQuery', {
                    query: query.trim(),
                    scope: family ? t('inFamily', { family: t(`family.${family}`) }) : '',
                  })
                : t('noFamily', { family: family ? t(`family.${family}`) : '' })
            }
            action={
              <Button size="sm" onClick={clear}>
                {t('clearFilters')}
              </Button>
            }
          />
        )}
      </Section>
    </>
  );
}
