// Les applis OAuth de Leon chez chaque éditeur : `LEON_OAUTH_<APPLI>_ID` et `..._SECRET`, facultatives.
// Chaque variable est lue en toutes lettres (et à chaque appel, pour que les tests la simulent) :
// le test des variables d'environnement ne reconnaît que cette forme, et `EnvSchema` n'y touche pas.

export const OAUTH_APP_KEYS = [
  'GITHUB',
  'NOTION',
  'LINEAR',
  'GITLAB',
  'ATLASSIAN',
  'ASANA',
  'CLICKUP',
  'MONDAY',
  'AIRTABLE',
  'HUBSPOT',
  'HELPSCOUT',
  'ATTIO',
  'BASECAMP',
  'MIRO',
  'PRODUCTBOARD',
  'OUTLOOK',
  'ONEDRIVE',
] as const;
export type OAuthAppKey = (typeof OAUTH_APP_KEYS)[number];

type Pair = readonly [id: string | undefined, secret: string | undefined];

const PAIRS: Record<OAuthAppKey, () => Pair> = {
  GITHUB: () => [process.env.LEON_OAUTH_GITHUB_ID, process.env.LEON_OAUTH_GITHUB_SECRET],
  NOTION: () => [process.env.LEON_OAUTH_NOTION_ID, process.env.LEON_OAUTH_NOTION_SECRET],
  LINEAR: () => [process.env.LEON_OAUTH_LINEAR_ID, process.env.LEON_OAUTH_LINEAR_SECRET],
  GITLAB: () => [process.env.LEON_OAUTH_GITLAB_ID, process.env.LEON_OAUTH_GITLAB_SECRET],
  ATLASSIAN: () => [process.env.LEON_OAUTH_ATLASSIAN_ID, process.env.LEON_OAUTH_ATLASSIAN_SECRET],
  ASANA: () => [process.env.LEON_OAUTH_ASANA_ID, process.env.LEON_OAUTH_ASANA_SECRET],
  CLICKUP: () => [process.env.LEON_OAUTH_CLICKUP_ID, process.env.LEON_OAUTH_CLICKUP_SECRET],
  MONDAY: () => [process.env.LEON_OAUTH_MONDAY_ID, process.env.LEON_OAUTH_MONDAY_SECRET],
  AIRTABLE: () => [process.env.LEON_OAUTH_AIRTABLE_ID, process.env.LEON_OAUTH_AIRTABLE_SECRET],
  HUBSPOT: () => [process.env.LEON_OAUTH_HUBSPOT_ID, process.env.LEON_OAUTH_HUBSPOT_SECRET],
  HELPSCOUT: () => [process.env.LEON_OAUTH_HELPSCOUT_ID, process.env.LEON_OAUTH_HELPSCOUT_SECRET],
  ATTIO: () => [process.env.LEON_OAUTH_ATTIO_ID, process.env.LEON_OAUTH_ATTIO_SECRET],
  BASECAMP: () => [process.env.LEON_OAUTH_BASECAMP_ID, process.env.LEON_OAUTH_BASECAMP_SECRET],
  MIRO: () => [process.env.LEON_OAUTH_MIRO_ID, process.env.LEON_OAUTH_MIRO_SECRET],
  PRODUCTBOARD: () => [
    process.env.LEON_OAUTH_PRODUCTBOARD_ID,
    process.env.LEON_OAUTH_PRODUCTBOARD_SECRET,
  ],
  OUTLOOK: () => [process.env.LEON_OAUTH_OUTLOOK_ID, process.env.LEON_OAUTH_OUTLOOK_SECRET],
  ONEDRIVE: () => [process.env.LEON_OAUTH_ONEDRIVE_ID, process.env.LEON_OAUTH_ONEDRIVE_SECRET],
};

// Une chaîne vide vaut une variable absente ; une paire incomplète est ignorée.
export function oauthClient(appKey: OAuthAppKey): { id: string; secret: string } | null {
  const [id, secret] = PAIRS[appKey]();
  return id && secret ? { id, secret } : null;
}

// Nomme la variable manquante, jamais une valeur.
export function warnIncompleteOAuthPairs(): void {
  for (const appKey of OAUTH_APP_KEYS) {
    const [id, secret] = PAIRS[appKey]();
    if (Boolean(id) === Boolean(secret)) continue;
    const missing = id ? `LEON_OAUTH_${appKey}_SECRET` : `LEON_OAUTH_${appKey}_ID`;
    console.warn(`[leon] ${missing} absente : le bouton ${appKey} est désactivé.`);
  }
}
