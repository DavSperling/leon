'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth/auth';

export async function decideMcpAuthorization(formData: FormData) {
  const oauthQuery = formData.get('oauth_query');
  if (typeof oauthQuery !== 'string' || oauthQuery.length > 8000) redirect('/connexion');

  const result = await auth.api.oauth2Consent({
    headers: await headers(),
    body: { accept: formData.get('accept') === 'oui', oauth_query: oauthQuery },
  });
  if (result.url) redirect(result.url);
  redirect('/connexion');
}
