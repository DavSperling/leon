import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// « / » sans cookie de session : la page d'accueil publique (src/app/(site)/accueil), à la même adresse. Avec un cookie,
// rien ne change : la recherche, et sa propre vérification de la session (un cookie périmé renvoie à /connexion).
// GET et HEAD seulement : un POST sur « / » est une server action de l'appli, qui garde sa réponse.
// La réponse réécrite n'est jamais gardée par un cache partagé : à la même adresse, un visiteur connecté a l'appli.
export function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  const response = NextResponse.rewrite(new URL('/accueil', request.url));
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = { matcher: '/' };
