import type { z } from 'zod';
import { DOCUMENT_MAX_BYTES, documentExtension } from '@/lib/documents';
import { fileText } from '../drive/client';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
  ResponseTooBigError,
} from '../http';
import {
  DeltaPageSchema,
  DownloadSchema,
  type DriveItem,
  DrivesPageSchema,
  MeSchema,
  MyDriveSchema,
  SitesPageSchema,
} from './schemas';

// Les requêtes vers Microsoft Graph. Doc lue le 05/11/2026 :
//   https://learn.microsoft.com/en-us/graph/api/driveitem-delta (pages par @odata.nextLink, puis @odata.deltaLink
//     pour la suite ; $top admis ; « token » daté, OneDrive for Business et SharePoint seulement ; un élément
//     supprimé porte la facette `deleted`, sans nom ; 410 Gone : relecture complète)
//   https://learn.microsoft.com/en-us/graph/api/site-search (/sites?search=, Sites.Read.All)
//   https://learn.microsoft.com/en-us/graph/api/drive-list (/sites/{id}/drives : les bibliothèques d'un site)
//   https://learn.microsoft.com/en-us/graph/api/driveitem-get-content (?select=id,@microsoft.graph.downloadUrl ;
//     l'adresse de téléchargement se lit sans en-tête Authorization et expire vite : elle est demandée juste avant)
//   https://learn.microsoft.com/en-us/graph/api/resources/driveitem

const GRAPH = 'https://graph.microsoft.com/v1.0';
const PAGE_SIZE = 25;
// Comme Google Drive : PDF, Word, Excel, PowerPoint, texte et Markdown, lus par l'extraction de l'import manuel.
const READABLE = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md']);

// Une bibliothèque de documents : le OneDrive de la personne (`site` null) ou celle d'un site SharePoint.
export type Library = { id: string; site: string | null };

type Listed<T> = { value: T[]; '@odata.nextLink'?: string | null | undefined };

// Graph veut la seconde, sans les millisecondes.
const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

// Le code HTTP d'une erreur du client, ou null (réseau, réponse illisible).
export const statusOf = (error: unknown): number | null =>
  error instanceof ConnectorAuthError || error instanceof ConnectorHttpError ? error.status : null;

export const isReadable = (item: DriveItem): boolean =>
  Boolean(item.file) && READABLE.has(documentExtension(item.name ?? ''));

export function graphFiles(
  { accessToken }: { accessToken: string },
  http: ConnectorHttp,
  downloadHosts: string[],
) {
  const headers = { authorization: `Bearer ${accessToken}` };

  async function all<T>(url: string, query: HttpRequest['query'], schema: z.ZodType<Listed<T>>) {
    const rows: T[] = [];
    let request: HttpRequest | null = { url, headers, query };
    while (request) {
      const page: Listed<T> = await http.json(request, schema);
      rows.push(...page.value);
      const next = page['@odata.nextLink'];
      request = next ? { url: next, headers } : null;
    }
    return rows;
  }

  // Un site fermé à la personne depuis la recherche, ou supprimé : laissé de côté.
  async function siteDrives(siteId: string) {
    try {
      return await all(
        `${GRAPH}/sites/${siteId}/drives`,
        { $select: 'id,driveType' },
        DrivesPageSchema,
      );
    } catch (error) {
      if (statusOf(error) === 403 || statusOf(error) === 404) return [];
      throw error;
    }
  }

  return {
    me() {
      const query = { $select: 'id,displayName,mail,userPrincipalName' };
      return http.json({ url: `${GRAPH}/me`, headers, query }, MeSchema);
    },

    // Le OneDrive de la personne, puis les bibliothèques de documents des sites qu'elle peut lire.
    async libraries(): Promise<Library[]> {
      const libraries: Library[] = [];
      try {
        const mine = await http.json(
          { url: `${GRAPH}/me/drive`, headers, query: { $select: 'id' } },
          MyDriveSchema,
        );
        libraries.push({ id: mine.id, site: null });
      } catch (error) {
        // Pas de OneDrive (aucune licence, jamais ouvert) : les sites seulement.
        if (statusOf(error) !== 404) throw error;
      }
      const sites = await all(
        `${GRAPH}/sites`,
        { search: '*', $select: 'id,displayName,name' },
        SitesPageSchema,
      );
      for (const site of sites) {
        for (const drive of await siteDrives(site.id)) {
          if (drive.driveType !== 'documentLibrary') continue;
          if (libraries.some((known) => known.id === drive.id)) continue;
          libraries.push({ id: drive.id, site: site.displayName || site.name || 'SharePoint' });
        }
      }
      return libraries;
    },

    // La première page d'une bibliothèque : ce qui a changé depuis `since`, PAGE_SIZE éléments par page.
    firstDelta(libraryId: string, since: Date): string {
      const url = new URL(`${GRAPH}/drives/${libraryId}/root/delta`);
      url.searchParams.set('token', apiTime(since));
      url.searchParams.set('$top', String(PAGE_SIZE));
      return url.toString();
    },

    delta(url: string) {
      return http.json({ url, headers }, DeltaPageSchema);
    },

    // Le texte d'un fichier, ou null s'il ne se lit pas : plus de 10 Mo, supprimé ou fermé entre-temps, adresse de
    // téléchargement hors des hôtes du locataire, refusé (fichier protégé), illisible.
    async text(libraryId: string, item: DriveItem): Promise<string | null> {
      if ((item.size ?? 0) > DOCUMENT_MAX_BYTES) return null;
      const found = await http.json(
        {
          url: `${GRAPH}/drives/${libraryId}/items/${item.id}`,
          headers,
          query: { $select: 'id,@microsoft.graph.downloadUrl' },
          acceptStatus: [403, 404],
        },
        DownloadSchema,
      );
      const url = found['@microsoft.graph.downloadUrl'];
      if (!url || !URL.canParse(url) || !downloadHosts.includes(new URL(url).host)) return null;
      let answer: Awaited<ReturnType<ConnectorHttp['bytes']>>;
      try {
        // Une adresse déjà signée : sans le jeton. Un 401 ici ne dit rien de l'accès de la connexion.
        answer = await http.bytes({
          url,
          headers: { accept: '*/*' },
          acceptStatus: [401, 403, 404],
        });
      } catch (error) {
        if (error instanceof ResponseTooBigError) return null;
        throw error;
      }
      if (answer.status >= 300) return null;
      return fileText(
        documentExtension(item.name ?? ''),
        answer.bytes,
        'connector.onedrive_unreadable',
      );
    },
  };
}
