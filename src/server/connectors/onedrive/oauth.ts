import { z } from 'zod';
import { outlookOAuth } from '../outlook/oauth';
import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec OneDrive / SharePoint » : le même déroulé Microsoft que celui d'Outlook (locataire
// « organizations », PKCE, lien d'accord de l'administrateur ; voir outlook/oauth.ts), avec une appli Entra à part.
//
// Pourquoi une appli à part (LEON_OAUTH_ONEDRIVE_*) et pas celle d'Outlook : le lien d'accord de l'administrateur
// accorde tout ce que l'appli déclare (`/.default`). Avec une seule appli, l'administrateur qui accepte Outlook
// donnerait aussi la lecture de tous les sites SharePoint. Deux applis : il accepte outil par outil, au prix d'une
// seconde inscription Entra et d'un second clic d'accord. Revenir à une seule appli : mettre `appKey: 'OUTLOOK'` ici
// et déclarer ces droits dans l'appli d'Outlook.
//
// Droits, lecture seule, d'après https://learn.microsoft.com/en-us/graph/permissions-reference et les tables
// « Permissions » des pages lues le 05/11/2026 (driveitem-delta, drive-list, site-search, driveitem-get-content) :
//   - Files.Read : le OneDrive de la personne (le droit le plus étroit pour /me/drive).
//   - Sites.Read.All : la recherche des sites (/sites?search, aucun droit plus étroit) ; il couvre aussi la liste des
//     bibliothèques, leur lecture en delta et le téléchargement. Files.Read.All n'apporterait que les fichiers
//     partagés depuis le OneDrive d'un autre, que Leon ne lit pas.
//   - User.Read : le nom du compte (`verify`).
// Avec le réglage Entra par défaut (« Let Microsoft manage your consent settings »), un employé ne peut pas accorder
// seul l'accès aux sites : l'administrateur du client doit donner son accord une fois.
//
// Non vérifié, sans compte réel : que `siteCollection.hostname` de /sites/root donne bien l'hôte où vivent les
// adresses de téléchargement ; que Sites.Read.All suffise sans Files.Read.All pour une bibliothèque d'équipe.

const SCOPES = ['offline_access', 'User.Read', 'Files.Read', 'Sites.Read.All'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

// L'hôte SharePoint du locataire, qui entre dans la liste des hôtes permis : vérifié, jamais pris tel quel.
export const SHAREPOINT_HOST = /^[a-z0-9-]+\.sharepoint\.com$/;
const hostname = z
  .string()
  .transform((host) => host.toLowerCase())
  .pipe(z.string().regex(SHAREPOINT_HOST));
const RootSiteSchema = z.object({ siteCollection: z.object({ hostname }) });

export const onedriveOAuth: OAuthSpec = {
  ...outlookOAuth,
  appKey: 'ONEDRIVE',
  scopes: SCOPES,
  extraTokenParams: {
    code: { scope: SCOPES.join(' ') },
    refresh: { scope: SCOPES.join(' ') },
  },
  setupHosts: ['graph.microsoft.com'],

  // Les fichiers se téléchargent sur l'hôte SharePoint du locataire (contoso.sharepoint.com, contoso-my.sharepoint.com
  // pour les OneDrive), qu'on lit ici une fois : il fixe les hôtes de la connexion.
  toConfig: async (tokens, _preFields, http) => {
    const root = await http.json(
      {
        url: `${GRAPH}/sites/root`,
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        query: { $select: 'siteCollection' },
      },
      RootSiteSchema,
    );
    return { sharepointHost: root.siteCollection.hostname };
  },
};
