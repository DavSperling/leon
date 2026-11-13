'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureKind, ProviderId } from '@/capture/turn';
import { Notice, PageHeader, Section, Thing, ThingGrid, ToolLogo } from '@/components/verre';
import type { OAuthNotice } from '@/lib/connection-form';
import { isInstant, nb } from '@/lib/verre';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import type { ChannelHealth } from '@/server/memory/stale';
import type { GroupOption } from '../documents/partage';
import { Catalogue } from './catalogue';
import './connexions.css';
import { CAPTURE_SETTINGS } from './model';
import { ReturnNotice } from './return-notice';
import { ToolDialog } from './tool-dialog';

/*
 * Écran Connexions (/connexions) : le titre, les outils branchés en cartes, ce qu'on peut ajouter en tuiles (les
 * conseillés en tête), puis les captures, en dernier. Un outil s'ouvre dans son panneau : au clic, par `?outil=<id>` (la barre de commande,
 * l'alerte de la barre latérale), ou au retour de l'éditeur (`?branche=` : « branché » ; `?erreur=…&outil=` : le refus
 * dans le panneau). L'adresse est ensuite remise à /connexions : un rechargement ne rejoue rien. Un retour qui ne
 * nomme aucun outil reste sous le titre. Le schéma et le jeu (carte.tsx, jeu.tsx) ne sont plus montrés ici, et l'en-tête
 * ne porte aucun dessin (retiré à la demande de David, le 13/11/2026).
 */

const DAY = 86_400_000;

export type ConnexionsProps = {
  catalog: CatalogItem[];
  /** Les outils du service de la personne (vide si on ne le connaît pas), dans l'ordre conseillé. */
  recommended: ProviderId[];
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  notice: OAuthNotice | null;
  /** Le retour est un branchement réussi (`?branche=`), pas un message d'erreur de l'éditeur. */
  justConnected?: boolean;
  /** Lien d'accord de l'administrateur de l'outil du retour : il vient du catalogue, jamais de l'adresse. */
  consentUrl: string | null;
  channels: ChannelHealth[];
  /** Les canaux de capture en retard (staleChannels), par type. */
  stale: string[];
  now: Date;
  /** Les groupes de l'organisation, pour dire et choisir qui voit ce qu'une connexion relève. */
  groups: GroupOption[];
  /** `?outil=<id>` : l'outil dont le panneau s'ouvre. */
  openTool?: ProviderId | null;
  /** Propriétaire ou administrateur : GitHub mène au choix des dépôts d'équipe. */
  mayChooseRepos?: boolean;
};

export function Connexions({
  catalog,
  recommended,
  connections,
  viewerId,
  canConnect,
  notice,
  justConnected = false,
  consentUrl,
  channels,
  stale,
  now,
  groups,
  openTool = null,
  mayChooseRepos = false,
}: ConnexionsProps) {
  const t = useTranslations('connections');
  const [open, setOpen] = useState(false);
  const [shownId, setShownId] = useState<ProviderId | null>(null);
  const [session, setSession] = useState(0);
  // le retour de l'éditeur, gardé ici : l'adresse est remise à zéro juste après l'avoir lu
  const [panelNotice, setPanelNotice] = useState<{
    notice: OAuthNotice | null;
    done: boolean;
  }>({ notice: null, done: false });
  const [banner] = useState(notice && !notice.tool ? notice : null);
  // Ce qui était branché à l'ouverture de la page : un outil branché depuis (ou au retour de l'éditeur) est « tout neuf ».
  const atFirst = useRef(new Set(connections.map((c) => c.provider)));

  const show = useCallback(
    (id: ProviderId, from: { notice: OAuthNotice | null; done: boolean }) => {
      setPanelNotice(from);
      setSession((s) => s + 1);
      setShownId(id);
      setOpen(true);
    },
    [],
  );
  const onOpen = useCallback((id: ProviderId) => show(id, { notice: null, done: false }), [show]);

  const target = notice?.tool ?? openTool;
  const known = target && catalog.some((p) => p.id === target) ? target : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rejoué quand l'adresse change (?outil=, retour de l'éditeur), pas à chaque rendu
  useEffect(() => {
    if (known) show(known, { notice: notice?.tool === known ? notice : null, done: justConnected });
    if (notice || openTool) window.history.replaceState(null, '', '/connexions');
  }, [known, notice?.text, openTool]);

  // Le panneau fermé sans pouvoir rendre le focus (la tuile est devenue une carte) : la carte de l'outil, sinon la recherche.
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    const el =
      document.querySelector<HTMLElement>(`[data-outil="${shownId}"]`) ??
      document.querySelector<HTMLElement>('input[type="search"]');
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'center', behavior: isInstant() ? 'auto' : 'smooth' });
  };

  // Les canaux de capture déjà utilisés : la santé de ce que Leon capte des assistants. Un retard se dit ; un canal
  // jamais utilisé se règle dans Réglages (son lien y mène aussi).
  const captures = channels.filter(
    (c): c is ChannelHealth & { kind: CaptureKind } =>
      c.kind in CAPTURE_SETTINGS && c.lastCaptureAt !== null,
  );

  const fresh = new Set(
    connections.map((c) => c.provider).filter((id) => !atFirst.current.has(id)),
  );
  if (justConnected && known) fresh.add(known);
  return (
    <>
      <PageHeader title={t('title')} />
      <ReturnNotice notice={banner} consentUrl={null} />
      {!canConnect && (
        <Notice tone="warning" className="mb-8">
          {nb(t('serverSetup'))} <code>openssl rand -base64 32</code>
          {t('serverSetupEnd')}
        </Notice>
      )}
      <Catalogue
        catalog={catalog}
        recommended={recommended}
        conns={connections}
        viewerId={viewerId}
        canConnect={canConnect}
        groups={groups}
        now={now}
        fresh={fresh}
        onOpen={onOpen}
      />
      {captures.length > 0 && (
        <Section id="captures" title={t('captures')} count={captures.length} tone={4}>
          <ThingGrid>
            {captures.map((c) => {
              const late = stale.includes(c.kind) && c.lastCaptureAt;
              return (
                <Thing
                  key={c.kind}
                  href={CAPTURE_SETTINGS[c.kind]}
                  picture={<ToolLogo kind={c.kind} size={28} />}
                  name={c.kindLabel}
                  caption={
                    late
                      ? t('captureSince', {
                          days: Math.floor((now.getTime() - late.getTime()) / DAY),
                        })
                      : undefined
                  }
                  error={Boolean(late)}
                />
              );
            })}
          </ThingGrid>
        </Section>
      )}
      <ToolDialog
        entry={catalog.find((p) => p.id === shownId) ?? null}
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={onCloseAutoFocus}
        conns={connections.filter((c) => c.provider === shownId)}
        viewerId={viewerId}
        now={now}
        canConnect={canConnect}
        session={session}
        groups={groups}
        notice={panelNotice.notice}
        consentUrl={consentUrl}
        justConnected={panelNotice.done}
        mayChooseRepos={mayChooseRepos}
      />
    </>
  );
}
