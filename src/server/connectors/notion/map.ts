import { z } from 'zod';
import { oneLine } from '@/server/memory/labels';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { ConnectorItem, ConnectorTurn } from '../types';
import { pageText, plainText } from './blocks';
import { type Api, fetchComments, fetchUser, type NotionPage } from './client';

// D'une page Notion à un élément : son corps, puis ses commentaires. Une ligne de base garde aussi ses propriétés
// utiles et remplies, lues dans la page que rend la recherche, dans un tour à part placé avant le corps.

type Author = ConnectorTurn['author'];
type Authors = (userId: string | undefined) => Promise<Author>;
const NOBODY: Author = { name: null, email: null };

// Une ressource secondaire ou retirée n'arrête pas le passage : 403 (capacité non cochée dans la
// connexion) et 404 (retirée depuis) rendent la valeur de repli. Tout le reste remonte, 401 compris.
async function ignoring<T>(call: Promise<T>, statuses: number[], fallback: T): Promise<T> {
  try {
    return await call;
  } catch (error) {
    const known = error instanceof ConnectorAuthError || error instanceof ConnectorHttpError;
    if (known && error.status !== null && statuses.includes(error.status)) return fallback;
    throw error;
  }
}

// Qui est l'auteur d'un identifiant : demandé une fois par personne pour tout le passage.
export function createAuthors(api: Api): Authors {
  const known = new Map<string, Promise<Author>>();
  return (userId) => {
    if (userId === undefined) return Promise.resolve(NOBODY);
    let author = known.get(userId);
    if (author === undefined) {
      const lookup = fetchUser(api, userId).then((user) => ({
        name: user.name ?? null,
        email: user.person?.email ?? null,
      }));
      author = ignoring(lookup, [403, 404], NOBODY);
      known.set(userId, author);
    }
    return author;
  };
}

const titleOf = (page: NotionPage): string =>
  plainText(
    Object.values(page.properties ?? {}).find((property) => property.type === 'title')?.title,
  );

// Les lignes d'une base : sous une source de données, ou sous une base (versions de l'API d'avant 2025-09-03).
const ROW_PARENTS = new Set(['data_source_id', 'database_id']);
// Au-delà, c'est une note, pas une propriété à mettre en tête.
const SHORT_TEXT_MAX = 100;
const Named = z.object({ name: z.string() });
const Person = z.object({ id: z.string(), name: z.string().nullish() });
const DateRange = z.object({ start: z.string(), end: z.string().nullish() });

type Property = NonNullable<NotionPage['properties']>[string];

// La valeur d'une propriété retenue, en texte ; '' si elle est vide, d'un autre type ou d'une forme inattendue.
async function propertyValue(property: Property, authors: Authors): Promise<string> {
  const value = property[property.type];
  switch (property.type) {
    case 'status':
    case 'select':
      return Named.safeParse(value).data?.name ?? '';
    case 'multi_select':
      return (z.array(Named).safeParse(value).data ?? []).map((option) => option.name).join(', ');
    case 'people': {
      // shortcut: la page rend 25 personnes au plus par propriété (doc), la lire à part si une équipe en met plus.
      // Une personne réduite à son identifiant (la doc le permet) prend le nom connu des auteurs du passage.
      const names: (string | null)[] = [];
      for (const person of z.array(Person).safeParse(value).data ?? [])
        names.push(person.name || (await authors(person.id)).name);
      return names.filter(Boolean).join(', ');
    }
    case 'date': {
      const date = DateRange.safeParse(value).data;
      return date ? [date.start, date.end].filter(Boolean).join(' → ') : '';
    }
    case 'checkbox':
      if (typeof value !== 'boolean') return '';
      return value ? '[x]' : '[ ]';
    case 'number':
      return typeof value === 'number' ? String(value) : '';
    case 'rich_text': {
      const text = plainText(value);
      return text.length <= SHORT_TEXT_MAX ? text : '';
    }
    default:
      return '';
  }
}

// Une ligne courte : « Statut : En cours · Responsable : Paul Martin · Échéance : 2026-12-03 ». Le titre n'y est pas.
async function propertiesLine(page: NotionPage, authors: Authors): Promise<string> {
  if (!ROW_PARENTS.has(page.parent?.type ?? '')) return '';
  const parts: string[] = [];
  for (const [name, property] of Object.entries(page.properties ?? {})) {
    const value = oneLine(await propertyValue(property, authors));
    if (value !== '') parts.push(`${oneLine(name)} : ${value}`);
  }
  return parts.join(' · ');
}

function parentLabel(parent: NotionPage['parent']): string | null {
  if (!parent) return null;
  const id = parent[parent.type];
  return typeof id === 'string' ? `${parent.type}:${id}` : parent.type;
}

// null si la page a été retirée depuis la recherche, ou n'a ni texte ni commentaire.
export async function pageToItem(
  api: Api,
  authors: Authors,
  page: NotionPage,
): Promise<ConnectorItem | null> {
  const body = await ignoring(pageText(api, page.id), [404], null);
  if (body === null) return null;
  const comments = await ignoring(fetchComments(api, page.id), [403, 404], []);
  // Une ligne sans corps se garde pour ses propriétés si elle a un titre : une ligne vide, laissée par un clic sur
  // « Nouveau », ne garde rien.
  const line = body !== '' || titleOf(page) !== '' ? await propertiesLine(page, authors) : '';

  // Les propriétés dans leur propre tour : un tour stocké porte l'empreinte de son texte (normalize.ts), et un statut
  // qui change ne doit pas recopier tout le corps dans un nouveau tour.
  const turns: ConnectorTurn[] = [];
  for (const [externalId, text] of [
    ['proprietes', line],
    ['body', body],
  ] as const) {
    if (text === '') continue;
    turns.push({
      externalId,
      role: 'document',
      author: await authors(page.created_by?.id ?? page.last_edited_by?.id),
      text,
      ts: page.last_edited_time,
    });
  }
  const chronological = comments.toSorted(
    (a, b) => Date.parse(a.created_time) - Date.parse(b.created_time),
  );
  for (const comment of chronological) {
    const text = plainText(comment.rich_text);
    if (text === '') continue;
    const author = await authors(comment.created_by?.id);
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: {
        name: author.name ?? comment.display_name?.resolved_name ?? null,
        email: author.email,
      },
      text,
      ts: comment.created_time,
    });
  }
  if (turns.length === 0) return null;

  const parent = parentLabel(page.parent);
  return {
    externalId: `page:${page.id}`,
    nature: 'page',
    title: titleOf(page) || 'Sans titre',
    url: page.url ?? null,
    updatedAt: page.last_edited_time,
    origin: parent === null ? {} : { parent },
    turns,
  };
}
