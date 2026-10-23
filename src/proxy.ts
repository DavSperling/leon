import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// « / » sans cookie de session : la page d'accueil publique (src/app/(site)/accueil), à la même adresse. Avec un cookie,
// rien ne change : la recherche, et sa propre vérification de la session (un cookie périmé renvoie à /connexion).
// GET seulement : un POST sur « / » est une server action de l'appli, qui garde sa réponse.
export function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/accueil', request.url));
}

export const config = { matcher: '/' };
