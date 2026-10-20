import { CircleCheck, CircleX, ExternalLink, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { ConnectionsCatalog } from '@/components/connections-catalog';
import { PAGE, PageHeader } from '@/components/page-header';
import { type OAuthNotice, oauthNotice } from '@/lib/connection-form';
import { cn } from '@/lib/utils';
import { requireUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';
import { tallyByKind } from '@/server/memory/sources';

export const metadata: Metadata = { title: 'Connexions' };

function NotConfigured() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-4 text-[14px] leading-6 text-warning">
      <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" className="mt-1 shrink-0" />
      <span>
        Les connecteurs ne sont pas configurés sur ce serveur : il manque la variable
        LEON_CONNECTORS_KEY, qui chiffre les clés des outils. Générez-la avec{' '}
        <code className="font-mono text-[13px]">openssl rand -base64 32</code>, ajoutez-la à
        l'environnement (voir .env.example), puis redémarrez Leon.
      </span>
    </p>
  );
}

// Le retour de l'éditeur (`?branche=` ou `?erreur=`). Le lien d'accord de l'administrateur vient du
// catalogue, jamais de l'adresse.
function ReturnNotice({ notice, consentUrl }: { notice: OAuthNotice; consentUrl: string | null }) {
  const success = notice.tone === 'success';
  const Icon = success ? CircleCheck : CircleX;
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-4 text-[14px] leading-6',
        success
          ? 'border-success/30 bg-success-soft text-success'
          : 'border-destructive/30 bg-destructive-soft text-destructive',
      )}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" className="mt-1 shrink-0" />
      <p>
        {notice.text}
        {notice.adminConsent && consentUrl && (
          <>
            {' '}
            <a
              href={consentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Lien d'accord pour l'administrateur
              <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUserContext();
  const [connections, tallies] = await Promise.all([listConnections(ctx), tallyByKind(ctx)]);
  const canConnect = connectorsKey() !== null;
  const catalog = listCatalog();
  const notice = oauthNotice(await searchParams);
  const consentUrl = catalog.find((item) => item.id === notice?.tool)?.adminConsentUrl ?? null;
  return (
    <div className={cn(PAGE, 'space-y-8')}>
      <PageHeader
        title="Connexions"
        description="Ce que Leon lit dans vos outils est visible de toute l’équipe, sauf le texte des boîtes mail, qui reste privé comme une conversation."
      />
      {notice && <ReturnNotice notice={notice} consentUrl={consentUrl} />}
      {!canConnect && <NotConfigured />}
      <ConnectionsCatalog
        catalog={catalog}
        connections={connections}
        viewerId={ctx.userId}
        canConnect={canConnect}
        kept={Object.fromEntries(tallies.map((tally) => [tally.kind, tally]))}
      />
    </div>
  );
}
