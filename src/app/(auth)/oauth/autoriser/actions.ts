'use server';

import { redirect } from 'next/navigation';
import { getUserContext } from '@/server/auth/session';
import {
  codeRedirect,
  errorRedirect,
  OAUTH_PARAMS,
  oauthAuthorizePath,
  oauthReturnPath,
  parseAuthorizeRequest,
} from '@/server/oauth/authorize';
import { isDocumentClientId } from '@/server/oauth/clients';
import { AUTHORIZE_PATH } from '@/server/oauth/metadata';

// « Autoriser » et « Refuser » de /oauth/autoriser (L6 point 5). Le formulaire ne vaut rien : la demande est
// revalidée en entier ici (client, adresse de retour, paramètres), et l'utilisateur comme l'espace viennent de la
// session, jamais des champs (le champ « space » ne sert qu'à vérifier que l'espace affiché est encore celui-là).
// Seul « allow » signe un code ; toute autre décision, y compris absente, est un refus.
// Rien n'est journalisé : ni le code, ni l'état, ni le client.
export async function authorizeOAuthAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(OAUTH_PARAMS.map((name) => [name, formData.get(name)]));
  // Un client_id en https:// est un document que parseAuthorizeRequest irait lire chez le client : le même levier anonyme
  // que pour la page, par un POST direct de l'action. La session passe d'abord, « Autoriser » comme « Refuser » : sans
  // elle, la page rebâtie (qui renvoie vers la connexion), sans rien lire. Un client_id signé se juge sur place et garde
  // l'ordre d'avant, refus sans session compris.
  let ctx: Awaited<ReturnType<typeof getUserContext>> = null;
  if (typeof raw.client_id === 'string' && isDocumentClientId(raw.client_id)) {
    ctx = await getUserContext();
    if (!ctx) redirect(oauthReturnPath(raw) ?? AUTHORIZE_PATH);
  }
  const request = await parseAuthorizeRequest(raw);
  if ('retour' in request) redirect(errorRedirect(request.retour, request.erreur));
  // Client ou adresse de retour qui ne valent plus : la page le dit. On ne renvoie jamais vers une adresse non vérifiée.
  if ('erreur' in request) redirect(AUTHORIZE_PATH);
  if (formData.get('decision') !== 'allow') redirect(errorRedirect(request, 'access_denied'));

  ctx ??= await getUserContext();
  // Session perdue entre l'affichage et le clic : la page choisit entre la connexion et l'accueil.
  if (!ctx) redirect(oauthAuthorizePath(request));
  // L'espace que la page a nommé n'est plus celui de la session (changé dans un autre onglet) : rien n'est signé, la page
  // se réaffiche avec le bon. Le champ ne sert qu'à cette comparaison, jamais de source : le code porte ctx.tenantId.
  if (formData.get('space') !== ctx.tenantId) redirect(oauthAuthorizePath(request));
  redirect(codeRedirect(request, ctx));
}
