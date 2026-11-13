import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthSheet, AuthTitle } from '@/components/verre/auth/frame';
import { Avatar } from '@/components/verre/ui/avatar';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import {
  errorRedirect,
  oauthFields,
  oauthReturnPath,
  parseAuthorizeRequest,
} from '@/server/oauth/authorize';
import { isDocumentClientId } from '@/server/oauth/clients';
import { authorizeOAuthAction } from './actions';

// L'adresse porte l'état et l'empreinte PKCE du client : elle ne part dans aucun en-tête Referer vers un autre site et
// la page n'est pas indexée. « same-origin » et non « no-referrer » : un formulaire natif (avant l'hydratation, ou
// sans JavaScript) partirait avec « Origin: null », que Next refuse.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('oauth.authorize');
  return { title: t('title'), referrer: 'same-origin', robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const CAPABILITIES = ['canSearch', 'canRead', 'canBriefing', 'canRemember'] as const;

// Là où un assistant (claude.ai, ChatGPT, Claude Code…) envoie le navigateur (L6 du plan « MCP distant »), sur le
// modèle de /ordinateur/autoriser. Client ou adresse de retour invalides : la page le dit, sans formulaire et sans
// rediriger. Toute autre erreur de la demande repart vers l'adresse de retour vérifiée. Sans session : la connexion,
// d'où la personne revient ici avec la demande (le chemin est rebâti à partir des valeurs validées, jamais tiré de
// l'adresse). Jamais requireUserContext() : un compte sans espace va à l'onboarding, pas à la connexion.
// Un client_id en https:// est un document que Leon irait lire chez le client : sans session, la connexion passe avant
// toute lecture (la page revalide tout au retour). Un client_id signé se juge sur place, sans réseau : il garde l'ordre
// de la demande d'abord.
export default async function AuthorizeOAuthPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('oauth.authorize');
  const query = await searchParams;
  let signedIn: boolean | undefined;
  const hasSession = async () => (signedIn ??= Boolean(await getSession()));
  const invalid = (reason: 'client' | 'retour') => (
    <AuthSheet wide>
      <AuthTitle>{t('invalidTitle')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty text-fg">
        {nb(t(reason === 'client' ? 'invalidClient' : 'invalidReturn'))}
      </p>
    </AuthSheet>
  );

  if (
    typeof query.client_id === 'string' &&
    isDocumentClientId(query.client_id) &&
    !(await hasSession())
  ) {
    const back = oauthReturnPath(query);
    // null : une valeur hors forme (répétée, trop longue). Sans session on ne lit rien pour la juger : lien non valide.
    if (!back) return invalid('client');
    redirect(`/connexion?${back.slice(back.indexOf('?') + 1)}`);
  }
  const request = await parseAuthorizeRequest(query);
  if ('retour' in request) redirect(errorRedirect(request.retour, request.erreur));
  if ('erreur' in request) return invalid(request.erreur);

  const fields = oauthFields(request);
  if (!(await hasSession())) redirect(`/connexion?${new URLSearchParams(fields)}`);
  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');
  const { organizationName } = await getViewerProfile(ctx);

  // Une décision de sécurité : tout se lit ici, au moment de choisir (pas de panneau). L'assistant est « une chose » :
  // son nom et, en légende, l'hôte où part le code, la seule chose que Leon a vérifiée du client, en évidence.
  return (
    <AuthSheet wide>
      <AuthTitle>{t('title')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty [overflow-wrap:anywhere] text-fg">
        {nb(t('question', { client: request.client.name, space: organizationName }))}
      </p>
      <div className="mt-6 flex min-h-[88px] items-center gap-3.5 rounded-card border border-line bg-sheet px-4 py-3 shadow-sheet">
        <Avatar name={request.client.name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-title font-semibold text-fg">{request.client.name}</p>
          <p className="mt-0.5 text-ui font-semibold [overflow-wrap:anywhere] text-fg">
            {request.loopback ? t('returnToLocal') : t('returnTo', { host: request.host })}
          </p>
        </div>
      </div>
      {/* Le nom d'une inscription (DCR) est déclaré, pas vérifié ; celui d'un document CIMD vient de l'hôte du client. */}
      {!isDocumentClientId(request.clientId) && (
        <p className="mt-2 text-label text-muted">{nb(t('declaredName'))}</p>
      )}
      <p className="mt-6 text-label text-muted">{nb(t('can'))}</p>
      <ul className="mt-2 grid gap-1.5 text-ui text-fg">
        {CAPABILITIES.map((key) => (
          <li key={key} className="flex items-start gap-2.5">
            <Check
              aria-hidden="true"
              strokeWidth={2}
              className="mt-[3px] size-3.5 shrink-0 text-icon"
            />
            {t(key)}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-ui font-medium text-pretty text-fg">{nb(t('warning'))}</p>
      <form action={authorizeOAuthAction} className="mt-4 grid gap-2">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {/* L'espace nommé plus haut : l'action vérifie que c'est encore celui de la session, elle n'en tire rien d'autre. */}
        <input type="hidden" name="space" value={ctx.tenantId} />
        <Button
          type="submit"
          name="decision"
          value="allow"
          variant="primary"
          className="h-10 w-full max-shell:h-11"
        >
          {t('allow')}
        </Button>
        <Button type="submit" name="decision" value="deny" className="h-10 w-full max-shell:h-11">
          {t('deny')}
        </Button>
      </form>
    </AuthSheet>
  );
}
