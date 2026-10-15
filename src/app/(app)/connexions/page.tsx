import { TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { ConnectionsCatalog } from '@/components/connections-catalog';
import { requireUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';

export const metadata: Metadata = { title: 'Connexions' };

function NotConfigured() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-4 text-[15px] leading-6 text-warning">
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

export default async function ConnectionsPage() {
  const ctx = await requireUserContext();
  const connections = await listConnections(ctx);
  const canConnect = connectorsKey() !== null;
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-10 px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Connexions</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Ce que Leon lit dans vos outils est visible de toute l'équipe.
        </p>
      </header>
      {!canConnect && <NotConfigured />}
      <ConnectionsCatalog
        catalog={listCatalog()}
        connections={connections}
        viewerId={ctx.userId}
        canConnect={canConnect}
      />
    </div>
  );
}
