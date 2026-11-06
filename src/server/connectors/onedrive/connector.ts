import { z } from 'zod';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { graphFiles, isReadable, type Library, statusOf } from './client';
import { onedriveOAuth, SHAREPOINT_HOST } from './oauth';
import type { DriveItem } from './schemas';

// OneDrive et SharePoint, par Microsoft Graph, en lecture seule. Doc : voir client.ts ; authentification : oauth.ts.
//
// Ce que Leon lit : le OneDrive de la personne, puis les bibliothèques de documents des sites SharePoint qu'elle peut
// lire (/sites?search=*). La liste des bibliothèques est gardée dans le curseur et relue une fois par jour. Chaque
// bibliothèque se lit en delta : la première fois, ce qui a changé depuis `since` ; ensuite, depuis le lien delta
// gardé dans le curseur. Un 410 (lien trop vieux) relit la bibliothèque depuis `since`. Un fichier supprimé
// (facette `deleted`) part de Leon par `SyncPage.removed`.
//
// Un fichier est une page, avec un seul tour `document` : son texte à sa dernière modification, extrait comme à
// l'import manuel (PDF, Word, Excel, PowerPoint, texte, Markdown ; 10 Mo au plus, comme Google Drive). Le texte
// reste privé à qui branche (`privateRaw`) : un OneDrive mêle travail et documents personnels.
//
// Non vérifié, sans compte Microsoft réel : que /sites?search=* rende tous les sites que la personne peut lire (la
// doc ne cite pas « * ») ; que le jeton daté et $top se combinent, et que $top suive dans @odata.nextLink ; qu'un
// dossier supprimé rende ses fichiers comme supprimés un par un ; la forme exacte des identifiants (longueur).
//
// shortcut: après un 410, les fichiers supprimés pendant le trou restent dans Leon, comme ceux d'une bibliothèque qui
// disparaît de la liste ; comparer la relecture complète à ce que Leon garde si un client le remarque.
// shortcut: chaque personne qui branche relit les mêmes sites d'équipe, chacun pour soi (texte privé) ; partager une
// lecture par site quand une entreprise branche à plusieurs.

const RELIST_MS = 24 * 60 * 60 * 1000;

const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  sharepointHost: z.string().regex(SHAREPOINT_HOST), // contoso.sharepoint.com, lu au branchement
});
type Config = z.infer<typeof ConfigSchema>;

// Les adresses de téléchargement : les sites (contoso.sharepoint.com) et les OneDrive (contoso-my.sharepoint.com).
// shortcut: un locataire multi-géo a d'autres hôtes ; ses fichiers hors de l'hôte principal sont laissés de côté.
const downloadHosts = ({ sharepointHost }: Config) => [
  sharepointHost,
  sharepointHost.replace(/\.sharepoint\.com$/, '-my.sharepoint.com'),
];

// `link` : le lien de la page suivante, ou le lien delta une fois la bibliothèque lue ; null avant la première page.
const CursorSchema = z.object({
  listedAt: z.iso.datetime(),
  libraries: z.array(
    z.object({ id: z.string(), site: z.string().nullable(), link: z.string().nullable() }),
  ),
});
type Cursor = z.infer<typeof CursorSchema>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readCursor(text: string | null): Cursor | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function fileItem(
  file: DriveItem,
  externalId: string,
  library: Library,
  text: string,
): ConnectorItem | null {
  const body = text.replaceAll('\r\n', '\n').trim();
  if (body === '' || !file.lastModifiedDateTime) return null;
  const editor = file.lastModifiedBy?.user;
  const updatedAt = new Date(file.lastModifiedDateTime).toISOString();
  return {
    externalId,
    nature: 'page',
    title: file.name?.trim() || 'Sans titre',
    url: file.webUrl ?? null,
    updatedAt,
    origin: library.site === null ? {} : { site: library.site },
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: { name: editor?.displayName ?? null, email: editor?.email ?? null },
        text: body,
        ts: updatedAt,
      },
    ],
  };
}

export const onedriveConnector: Connector<Config> = {
  id: 'onedrive',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: (config) => ['graph.microsoft.com', ...downloadHosts(config)],
  oauth: onedriveOAuth,
  privateRaw: true, // un OneDrive mêle travail et documents personnels

  async verify(config, http) {
    const me = await graphFiles(config, http, []).me();
    const address = me.mail || me.userPrincipalName;
    const key = me.id ? { accountKey: me.id } : {};
    if (me.displayName)
      return { account: address ? `${me.displayName} (${address})` : me.displayName, ...key };
    return { account: address || 'Microsoft account', ...key };
  },

  // Une page de delta à la fois (25 éléments) : la position avance après chacune.
  async *sync(config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const client = graphFiles(config, http, downloadHosts(config));
    let state = readCursor(cursor);
    if (state === null || Date.now() - Date.parse(state.listedAt) > RELIST_MS) {
      const links = new Map(state?.libraries.map((library) => [library.id, library.link]));
      const found = await client.libraries();
      state = {
        listedAt: new Date().toISOString(),
        libraries: found.map((library) => ({ ...library, link: links.get(library.id) ?? null })),
      };
    }

    for (const library of state.libraries) {
      let url = library.link ?? client.firstDelta(library.id, since);
      let restarted = false;
      for (;;) {
        let page: Awaited<ReturnType<typeof client.delta>>;
        try {
          page = await client.delta(url);
        } catch (error) {
          const status = statusOf(error);
          if (status === 410 && !restarted) {
            url = client.firstDelta(library.id, since);
            restarted = true;
            continue;
          }
          // Un site supprimé ou fermé à la personne depuis la liste : laissé de côté jusqu'à la prochaine liste.
          if (library.site !== null && (status === 403 || status === 404)) break;
          throw error;
        }

        const items: ConnectorItem[] = [];
        const removed: string[] = [];
        for (const row of page.value) {
          // L'identifiant d'un élément n'est unique que dans sa bibliothèque.
          const externalId = `file:${library.id}:${row.id}`;
          if (row.deleted) removed.push(externalId);
          else if (isReadable(row)) {
            const text = await client.text(library.id, row);
            const item = text === null ? null : fileItem(row, externalId, library, text);
            if (item) items.push(item);
          }
        }

        const next = page['@odata.nextLink'];
        const link = next || page['@odata.deltaLink'] || null;
        state = {
          ...state,
          libraries: state.libraries.map((known) =>
            known.id === library.id ? { ...known, link } : known,
          ),
        };
        yield { items, cursor: JSON.stringify(state), ...(removed.length > 0 && { removed }) };
        if (!next) break;
        url = next;
      }
    }
  },
};
