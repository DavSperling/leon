import type { OfficeError } from 'officeparser';
import { extractText } from '@/server/documents/documents';
import { logError } from '@/server/log';
import {
  type ConnectorHttp,
  ConnectorHttpError,
  GOOGLE_RATE_LIMIT,
  ResponseTooBigError,
} from '../http';
import { AboutSchema, type DriveFile, FilesPageSchema } from './schemas';

// Les requêtes vers l'API Google Drive. Doc lue le 25/10/2026 :
//   https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list (q, orderBy, corpora)
//   https://developers.google.com/workspace/drive/api/guides/search-files (modifiedTime, mimeType, trashed)
//   https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export (10 Mo au plus)
//   https://developers.google.com/workspace/drive/api/guides/ref-export-formats
// Un export ou un téléchargement ne passe pas dans un lot : une requête (un crédit Pipedream) par fichier.

const DRIVE = 'https://www.googleapis.com/drive/v3';
const FILE_FIELDS =
  'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,lastModifyingUser(displayName,emailAddress,me))';

// Ce que Leon lit, et comment : un export en texte pour les fichiers Google, le contenu pour le texte, le
// fichier passé à l'extraction de l'import manuel (documents.ts) pour les PDF et fichiers Office.
// Une feuille de calcul Google s'exporte en CSV, première feuille seulement (limite de Google).
export const READABLE: Record<string, { export: string } | { media: true } | { parse: string }> = {
  'application/vnd.google-apps.document': { export: 'text/plain' },
  'application/vnd.google-apps.presentation': { export: 'text/plain' },
  'application/vnd.google-apps.spreadsheet': { export: 'text/csv' },
  'text/plain': { media: true },
  'text/markdown': { media: true },
  'application/pdf': { parse: 'pdf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { parse: 'docx' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { parse: 'xlsx' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { parse: 'pptx' },
};

// Drive veut AAAA-MM-JJTHH:MM:SS, en UTC sans fuseau ; « >= » rend aussi le fichier du curseur.
const apiTime = (date: Date): string => date.toISOString().slice(0, 19);

export function driveClient(http: ConnectorHttp) {
  return {
    about() {
      const query = { fields: 'user(displayName,emailAddress,permissionId)' };
      return http.json({ url: `${DRIVE}/about`, query }, AboutSchema);
    },

    // Les fichiers lisibles modifiés depuis `from`, du plus ancien au plus récent, dans Mon Drive, les
    // fichiers partagés avec l'utilisateur et les drives partagés dont il est membre.
    async *files(from: Date): AsyncGenerator<DriveFile[]> {
      const types = Object.keys(READABLE).map((type) => `mimeType = '${type}'`);
      const q = `modifiedTime >= '${apiTime(from)}' and trashed = false and (${types.join(' or ')})`;
      let pageToken: string | undefined;
      do {
        const query = {
          q,
          orderBy: 'modifiedTime',
          pageSize: 100,
          fields: FILE_FIELDS,
          corpora: 'allDrives',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageToken,
        };
        const page = await http.json({ url: `${DRIVE}/files`, query }, FilesPageSchema);
        yield page.files ?? [];
        pageToken = page.nextPageToken ?? undefined;
      } while (pageToken);
    },

    // Le texte d'un fichier, ou null s'il ne se lit pas : trop gros pour l'export (403
    // exportSizeLimitExceeded) ou pour Leon (plus de 10 Mo), téléchargement interdit par son
    // propriétaire (403), supprimé (404), PDF ou fichier Office illisible (protégé, abîmé). Un 403 de
    // limite de débit n'en est pas un : il fait échouer le passage, qui reprendra au même fichier.
    async content(file: DriveFile): Promise<string | null> {
      const how = READABLE[file.mimeType];
      if (!how) return null;
      const id = encodeURIComponent(file.id);
      const request =
        'export' in how
          ? { url: `${DRIVE}/files/${id}/export`, query: { mimeType: how.export } }
          : { url: `${DRIVE}/files/${id}`, query: { alt: 'media', supportsAllDrives: true } };
      let answer: Awaited<ReturnType<ConnectorHttp['bytes']>>;
      try {
        answer = await http.bytes({
          ...request,
          headers: { accept: '*/*' },
          acceptStatus: [403, 404],
        });
      } catch (error) {
        if (error instanceof ResponseTooBigError) return null;
        throw error;
      }
      if (answer.status === 404) return null;
      if (answer.status === 403) {
        if (GOOGLE_RATE_LIMIT.test(new TextDecoder().decode(answer.bytes)))
          throw new ConnectorHttpError(429, 'Google Drive rate limit reached');
        return null;
      }
      if (!('parse' in how)) return new TextDecoder().decode(answer.bytes);
      return fileText(how.parse, answer.bytes, 'connector.drive_unreadable');
    },
  };
}

// Le texte d'un fichier passé à l'extraction de l'import manuel (PDF, Office, texte), ou null s'il est illisible
// (protégé, abîmé). Partagé avec OneDrive.
export async function fileText(
  extension: string,
  bytes: Uint8Array,
  event: string,
): Promise<string | null> {
  try {
    return (await extractText(extension, bytes)).text;
  } catch (error) {
    // Ni le nom ni le contenu du fichier : le code de l'erreur d'officeparser.
    const reason = (error as OfficeError).officeIssue?.code ?? (error as Error).name;
    logError(event, error, { reason });
    return null;
  }
}
