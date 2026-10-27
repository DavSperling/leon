import { z } from 'zod';
import { advance, isDone, type Mark, MarkSchema } from '../outlook/cursor';
import { type PipedreamConfig, PipedreamConfigSchema } from '../pipedream';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { driveClient } from './client';
import type { DriveFile } from './schemas';

// Google Drive, par Pipedream Connect (pipedream.ts) : l'appli Google est celle de Pipedream (droit
// `drive` complet) ; chaque requête passe par son proxy et coûte 1 crédit. Doc : voir client.ts.
//
// Un fichier est une page, avec un seul tour `document` : son texte à sa dernière modification. Leon ne
// lit que les documents, présentations et feuilles de calcul Google, et les fichiers texte ou Markdown ;
// les PDF, Word et images sont laissés de côté. Le curseur est une position (instant de modification du
// dernier fichier lu et identifiants déjà lus à cet instant), comme celle d'Outlook.
//
// Non vérifié : que corpora=allDrives rende bien les fichiers partagés avec l'utilisateur et ceux des
// drives partagés ; le texte exporté d'une présentation.

const CursorSchema = z.object({ mark: MarkSchema.nullable() });

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readMark(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.mark : null;
  } catch {
    return null;
  }
}

function fileItem(file: DriveFile, text: string): ConnectorItem | null {
  const body = text.replaceAll('\r\n', '\n').trim();
  if (body === '') return null;
  const editor = file.lastModifyingUser;
  const updatedAt = new Date(file.modifiedTime).toISOString();
  return {
    externalId: `file:${file.id}`,
    nature: 'page',
    title: file.name.trim() || 'Sans titre',
    url: file.webViewLink ?? null,
    updatedAt,
    origin: {},
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: { name: editor?.displayName ?? null, email: editor?.emailAddress ?? null },
        ...(editor?.me ? { side: 'team' as const } : {}),
        text: body,
        ts: updatedAt,
      },
    ],
  };
}

export const driveConnector: Connector<PipedreamConfig> = {
  id: 'drive',
  configSchema: PipedreamConfigSchema,
  secretFields: [],
  hosts: () => ['www.googleapis.com'],
  pipedream: { app: 'google_drive' },
  privateRaw: true, // Mon Drive mêle travail et documents personnels

  async verify(_config, http) {
    const { user } = await driveClient(http).about();
    const address = user.emailAddress;
    const key = {
      ...(user.permissionId ? { accountKey: user.permissionId } : {}),
      ...(address ? { email: address } : {}),
    };
    if (user.displayName)
      return { account: address ? `${user.displayName} (${address})` : user.displayName, ...key };
    return { account: address || 'compte Google Drive', ...key };
  },

  // Un fichier à la fois : chaque export est une requête, la position avance après chacun.
  async *sync(_config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const client = driveClient(http);
    let mark = readMark(cursor);
    for await (const files of client.files(mark ? new Date(mark.at) : since)) {
      for (const file of files) {
        const row = { id: file.id, at: file.modifiedTime };
        if (isDone(mark, row)) continue;
        const text = await client.content(file);
        const item = text === null ? null : fileItem(file, text);
        mark = advance(mark, row);
        yield { items: item ? [item] : [], cursor: JSON.stringify({ mark }) };
      }
    }
  },
};
