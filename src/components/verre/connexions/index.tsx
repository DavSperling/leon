'use client';

import './connexions.css';
import { ArrowUpRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Notice, PageHeader } from '@/components/verre';
import type { OAuthNotice } from '@/lib/connection-form';
import { isInstant, nb, rise } from '@/lib/verre';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import type { ChannelHealth } from '@/server/memory/stale';
import { CarteConnexions } from './carte';
import { Catalogue } from './catalogue';
import { ToolDialog } from './tool-dialog';

/*
 * Écran Connexions (/connexions) : le schéma vivant, puis le catalogue en deux zones, et la fenêtre de l'outil.
 * Le retour de l'éditeur (`?branche=` ou `?erreur=`, lu par oauthNotice côté serveur) s'affiche en tête ; l'outil
 * tout juste branché par le bouton reçoit l'anneau. Une clé testée avec succès : toast « … est branché. », le
 * formulaire se replie ; quand la fenêtre se ferme, le focus va sur le nouveau bouton de l'outil et un anneau bat
 * une fois autour de sa ligne.
 */

export type ConnexionsProps = {
  catalog: CatalogItem[];
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  notice: OAuthNotice | null;
  /** Lien d'accord de l'administrateur de l'outil du retour : il vient du catalogue, jamais de l'adresse. */
  consentUrl: string | null;
  channels: ChannelHealth[];
  /** Les canaux de capture en retard (staleChannels), par type. */
  stale: string[];
  now: Date;
};

function ReturnNotice({
  notice,
  consentUrl,
}: {
  notice: OAuthNotice | null;
  consentUrl: string | null;
}) {
  const t = useTranslations('connections');
  return (
    // initial={false} : l'avis rendu par le serveur (retour de l'éditeur) est visible avant l'hydratation
    <AnimatePresence mode="wait" initial={false}>
      {notice && (
        <motion.div
          key={notice.text}
          variants={rise}
          initial="initial"
          animate="animate"
          exit="exit"
          className="mb-6"
        >
          <Notice tone={notice.tone} live={notice.tone === 'success' ? 'status' : 'alert'}>
            {nb(notice.text)}
            {notice.adminConsent && consentUrl && (
              <>
                {' '}
                <a
                  href={consentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-fg underline decoration-destructive-line underline-offset-4 hover:decoration-destructive"
                >
                  {t('adminConsent')}
                  <ArrowUpRight
                    aria-hidden="true"
                    strokeWidth={1.8}
                    className="ml-0.5 inline size-3.5 align-[-2px]"
                  />
                  <span className="sr-only">{t('newTab')}</span>
                </a>
              </>
            )}
          </Notice>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Connexions({
  catalog,
  connections,
  viewerId,
  canConnect,
  notice,
  consentUrl,
  channels,
  stale,
  now,
}: ConnexionsProps) {
  const t = useTranslations('connections');
  const [openId, setOpenId] = useState<ProviderId | null>(null);
  const [shownId, setShownId] = useState<ProviderId | null>(null);
  const [session, setSession] = useState(0);
  // l'outil que le retour de l'éditeur vient de brancher bat une fois
  const [fresh, setFresh] = useState<string | null>(
    notice?.tone === 'success' && !notice.adminConsent ? notice.tool : null,
  );
  const [filter, setFilter] = useState('');
  // l'élément qui a ouvert la fenêtre ; s'il a disparu (l'outil a changé de zone), le focus va au nouveau bouton de l'outil
  const opener = useRef<HTMLElement | null>(null);
  const before = useRef(0);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  const open = useCallback(
    (id: ProviderId) => {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      before.current = connections.filter((c) => c.provider === id).length;
      setSession((s) => s + 1);
      setShownId(id);
      setOpenId(id);
    },
    [connections],
  );

  const mine = connections.filter((c) => c.provider === shownId);

  const onCloseAutoFocus = (e: Event) => {
    if (!opener.current || opener.current.isConnected) return;
    e.preventDefault();
    const id = shownId;
    requestAnimationFrame(() => {
      const el =
        document.querySelector<HTMLElement>(`[data-outil="${id}"]`) ??
        document.querySelector<HTMLElement>('input[type="search"]');
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'center', behavior: isInstant() ? 'auto' : 'smooth' });
    });
  };

  const onOpenChange = (o: boolean) => {
    if (o) return;
    setOpenId(null);
    // branché par clé, la fenêtre restait ouverte : l'anneau de la ligne attendait qu'elle se ferme pour être vu
    if (mine.length > before.current) setFresh(shownId);
  };

  // AnimatePresence propre à l'écran : celle de l'ossature (initial={false}) bloquerait l'entrée des composants
  // motion montés ensuite (lignes du catalogue, fenêtre).
  return (
    <AnimatePresence>
      <div key="connexions">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <ReturnNotice notice={notice} consentUrl={consentUrl} />
        {!canConnect && (
          <Notice tone="warning" className="mb-6">
            {nb(t('serverSetup'))}{' '}
            <code className="rounded-[5px] whitespace-nowrap bg-warning-soft px-1 py-px font-mono text-[12.5px] text-fg shadow-[inset_0_0_0_1px_var(--warning-line)]">
              openssl rand -base64 32
            </code>
            {t('serverSetupEnd')}
          </Notice>
        )}
        <CarteConnexions
          catalog={catalog}
          conns={connections}
          channels={channels}
          stale={stale}
          now={now}
          onOpen={open}
        />
        <Catalogue
          catalog={catalog}
          conns={connections}
          now={now}
          onOpen={open}
          filter={filter}
          onFilter={setFilter}
          fresh={fresh}
        />
        <ToolDialog
          entry={catalog.find((p) => p.id === shownId) ?? null}
          open={openId !== null}
          onOpenChange={onOpenChange}
          onCloseAutoFocus={onCloseAutoFocus}
          conns={mine}
          viewerId={viewerId}
          now={now}
          canConnect={canConnect}
          session={session}
        />
      </div>
    </AnimatePresence>
  );
}
