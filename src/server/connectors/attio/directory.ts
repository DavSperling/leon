import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { Actor, AttioClient, RecordInfo } from './client';

// Ce qu'une note ou un commentaire ne porte pas lui-même : le nom de son auteur (liste des
// membres de l'espace) et sa fiche parente (nom et lien). Tout est facultatif : une clé qui n'a
// pas ces droits (403) ou une fiche supprimée (404) laisse l'élément sortir sans ces détails.

export type Author = { name: string | null; email: string | null };
export type Parent = { name: string | null; url: string | null };
export type WhoIs = (actor: Actor) => Author;

const NOBODY: Author = { name: null, email: null };

const isDenied = (error: unknown): boolean =>
  error instanceof ConnectorAuthError && error.status === 403;
const isMissing = (error: unknown): boolean =>
  error instanceof ConnectorHttpError && error.status === 404;

// Une personne a un `full_name`, une entreprise ou une affaire une `value`.
function nameOf(info: RecordInfo): string | null {
  const first = info.name?.[0];
  const text = typeof first?.full_name === 'string' ? first.full_name : first?.value;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
}

export function makeDirectory(attio: AttioClient) {
  let members: Promise<Map<string, Author>> | undefined;
  let recordsDenied = false;
  const records = new Map<string, Promise<Parent | null>>();

  async function loadMembers(): Promise<Map<string, Author>> {
    try {
      const list = await attio.members();
      return new Map(
        list.map((member) => {
          const name = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();
          const author = { name: name || null, email: member.email_address ?? null };
          return [member.id.workspace_member_id, author];
        }),
      );
    } catch (error) {
      if (isDenied(error)) return new Map(); // demandé une fois, pas pour chaque élément
      throw error;
    }
  }

  async function loadRecord(object: string, recordId: string): Promise<Parent | null> {
    if (recordsDenied) return null;
    try {
      const info = await attio.record(object, recordId);
      return { name: nameOf(info), url: info.web_url ?? null };
    } catch (error) {
      if (isDenied(error)) recordsDenied = true;
      if (isDenied(error) || isMissing(error)) return null;
      throw error;
    }
  }

  return {
    // Les membres sont lus à la première demande seulement : un passage sans rien de nouveau n'en lit pas.
    async whoIs(): Promise<WhoIs> {
      members ??= loadMembers();
      const known = await members;
      return (actor) =>
        actor?.type === 'workspace-member' && actor.id ? (known.get(actor.id) ?? NOBODY) : NOBODY;
    },

    // La fiche est identifiée par son seul `recordId` : un fil la désigne par l'identifiant de son
    // objet, une note par son nom court, mais c'est la même fiche.
    parent(object: string, recordId: string): Promise<Parent | null> {
      let known = records.get(recordId);
      if (known === undefined) {
        known = loadRecord(object, recordId);
        records.set(recordId, known);
      }
      return known;
    },
  };
}

export type Directory = ReturnType<typeof makeDirectory>;
