import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
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
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('invalidTitle')}</h1>
      <p className="mt-3 text-ui text-muted">
        {nb(t(reason === 'client' ? 'invalidClient' : 'invalidReturn'))}
      </p>
    </div>
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

  return (
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('title')}</h1>
      <p className="mt-3 text-ui [overflow-wrap:anywhere] text-muted">
        {nb(t('question', { client: request.client.name, space: organizationName }))}
      </p>
      {/* Le nom d'une inscription (DCR) est déclaré, pas vérifié ; celui d'un document CIMD vient de l'hôte du client. */}
      {!isDocumentClientId(request.clientId) && (
        <p className="mt-1.5 text-ui text-muted">{nb(t('declaredName'))}</p>
      )}
      {/* L'hôte où part le code, la seule chose que Leon a vérifiée du client : en évidence. */}
      <p className="mt-5 text-body font-semibold [overflow-wrap:anywhere] text-fg">
        {request.loopback ? t('returnToLocal') : t('returnTo', { host: request.host })}
      </p>
      <p className="mt-5 text-ui text-muted">{nb(t('can'))}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ui text-muted">
        {CAPABILITIES.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <Notice tone="warning" className="mt-6">
        {t('warning')}
      </Notice>
      <form action={authorizeOAuthAction} className="mt-6 grid gap-3">
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
          size="lg"
          className="w-full"
        >
          {t('allow')}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="deny"
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {t('deny')}
        </Button>
      </form>
    </div>
  );
}
