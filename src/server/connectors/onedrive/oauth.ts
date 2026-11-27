import { z } from 'zod';
import { microsoftOAuth } from '../microsoft';
import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec OneDrive / SharePoint » : l'appli Microsoft de Leon (microsoft.ts), comptes
// professionnels et personnels (choix de David du 27/11/2026). Tous les fichiers et tous les sites sont demandés
// d'avance ; aujourd'hui Leon ne fait que lire.
//
// https://learn.microsoft.com/en-us/graph/permissions-reference, relu le 27/11/2026 : Files.ReadWrite.All (« Have full
// access to all files user can access ») et Sites.ReadWrite.All (« Edit or delete items in all site collections »)
// n'exigent pas en eux-mêmes l'accord de l'administrateur (le réglage par défaut des annuaires le réclame quand même,
// voir microsoft.ts) et sont « available for consent in personal Microsoft accounts ».
//
// Au branchement, le type du OneDrive dit si le compte est personnel (https://learn.microsoft.com/en-us/graph/api/
// resources/drive, lu le 27/11/2026 : `driveType` vaut « personal » pour un OneDrive personnel, « business » sinon).
// Un compte personnel n'a pas de SharePoint : les pages des sites (site-get, site-search) disent « Not supported »
// pour lui. Pour un compte professionnel, on lit l'hôte SharePoint de l'entreprise, où se téléchargent les fichiers.
//
// Non vérifié, sans compte réel : que `siteCollection.hostname` de /sites/root donne bien l'hôte des adresses de
// téléchargement.

const GRAPH = 'https://graph.microsoft.com/v1.0';

// L'hôte SharePoint de l'entreprise, qui entre dans la liste des hôtes permis : vérifié, jamais pris tel quel.
export const SHAREPOINT_HOST = /^[a-z0-9-]+\.sharepoint\.com$/;
const hostname = z
  .string()
  .transform((host) => host.toLowerCase())
  .pipe(z.string().regex(SHAREPOINT_HOST));
const RootSiteSchema = z.object({ siteCollection: z.object({ hostname }) });
const DriveTypeSchema = z.object({ driveType: z.string().nullish() });

export const onedriveOAuth: OAuthSpec = {
  ...microsoftOAuth('onedrive', 'common', ['Files.ReadWrite.All', 'Sites.ReadWrite.All']),
  setupHosts: ['graph.microsoft.com'],

  // `sharepointHost` : contoso.sharepoint.com, ou null pour un compte personnel.
  toConfig: async (tokens, _preFields, http) => {
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    // Un employé sans OneDrive (aucune licence) reçoit un 404 : il a quand même les sites.
    const drive = await http.json(
      { url: `${GRAPH}/me/drive`, headers, query: { $select: 'driveType' }, acceptStatus: [404] },
      DriveTypeSchema,
    );
    if (drive.driveType === 'personal') return { sharepointHost: null };
    const root = await http.json(
      { url: `${GRAPH}/sites/root`, headers, query: { $select: 'siteCollection' } },
      RootSiteSchema,
    );
    return { sharepointHost: root.siteCollection.hostname };
  },
};
