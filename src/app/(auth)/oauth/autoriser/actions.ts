'use server';

import { redirect } from 'next/navigation';
import { getUserContext } from '@/server/auth/session';
import {
  codeRedirect,
  errorRedirect,
  OAUTH_PARAMS,
  oauthAuthorizePath,
  parseAuthorizeRequest,
} from '@/server/oauth/authorize';
import { AUTHORIZE_PATH } from '@/server/oauth/metadata';

// « Autoriser » et « Refuser » de /oauth/autoriser (L6 point 5). Le formulaire ne vaut rien : la demande est
// revalidée en entier ici (client, adresse de retour, paramètres), et l'utilisateur comme l'espace viennent de la
// session, jamais des champs. Seul « allow » signe un code ; toute autre décision, y compris absente, est un refus.
// Rien n'est journalisé : ni le code, ni l'état, ni le client.
export async function authorizeOAuthAction(formData: FormData): Promise<void> {
  const request = await parseAuthorizeRequest(
    Object.fromEntries(OAUTH_PARAMS.map((name) => [name, formData.get(name)])),
  );
  if ('retour' in request) redirect(errorRedirect(request.retour, request.erreur));
  // Client ou adresse de retour qui ne valent plus : la page le dit. On ne renvoie jamais vers une adresse non vérifiée.
  if ('erreur' in request) redirect(AUTHORIZE_PATH);
  if (formData.get('decision') !== 'allow') redirect(errorRedirect(request, 'access_denied'));

  const ctx = await getUserContext();
  // Session perdue entre l'affichage et le clic : la page choisit entre la connexion et l'accueil.
  if (!ctx) redirect(oauthAuthorizePath(request));
  redirect(codeRedirect(request, ctx));
}
