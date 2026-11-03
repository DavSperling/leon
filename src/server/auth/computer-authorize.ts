import { z } from 'zod';

// Les trois paramètres de la page d'autorisation (K3 du plan « CLI sans clone »), qu'on les lise dans l'adresse de la
// page, dans le formulaire de l'action ou dans le champ de retour de la connexion : une seule règle, partout.
// Le retour vers l'ordinateur se bâtit ici, à partir du port entier validé ; aucune adresse reçue ne s'y retrouve.

const ParamsSchema = z.object({
  // 1024 à 65535, en chiffres seuls : « 1234@evil.example », « 0x4d2 » ou « 04242 » n'en sont pas.
  port: z
    .string()
    .regex(/^[1-9]\d{3,4}$/)
    .transform(Number)
    .pipe(z.number().min(1024).max(65535)),
  etat: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
  empreinte: z.string().regex(/^[0-9a-f]{64}$/), // SHA-256 du jeton, comme hashApiToken
});
export type AuthorizeParams = z.output<typeof ParamsSchema>;

// `raw` : ce qu'on a lu (searchParams, FormData…), qui peut porter d'autres clés. null si l'un des trois est invalide.
export function parseAuthorizeParams(raw: Record<string, unknown>): AuthorizeParams | null {
  const { port, etat, empreinte } = raw;
  const parsed = ParamsSchema.safeParse({ port, etat, empreinte });
  return parsed.success ? parsed.data : null;
}

export const authorizeQuery = ({ port, etat, empreinte }: AuthorizeParams) =>
  new URLSearchParams({ port: String(port), etat, empreinte }).toString();

export const authorizePath = (params: AuthorizeParams) =>
  `/ordinateur/autoriser?${authorizeQuery(params)}`;

// « Autoriser » : le code signé ; « Annuler » : refus=1. Toujours http://127.0.0.1:<port>/retour (la CLI n'écoute que là).
export function returnUrl({ port, etat }: AuthorizeParams, outcome: { code: string } | 'refus') {
  const query = new URLSearchParams(
    outcome === 'refus' ? { refus: '1', etat } : { code: outcome.code, etat },
  );
  return `http://127.0.0.1:${port}/retour?${query}`;
}

// Où va la connexion qui suit une page d'autorisation sans session : le champ `retour` du formulaire revient d'un
// navigateur, donc il ne vaut rien tel quel. On n'en garde que les trois paramètres, revalidés, et on rebâtit le chemin.
// Tout autre contenu : l'accueil.
export function pathAfterSignIn(value: unknown): string {
  const prefix = '/ordinateur/autoriser?';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return '/';
  const params = parseAuthorizeParams(
    Object.fromEntries(new URLSearchParams(value.slice(prefix.length))),
  );
  return params ? authorizePath(params) : '/';
}
