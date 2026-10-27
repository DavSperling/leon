import { z } from 'zod';
import { advance, isDone, type Mark, MarkSchema } from '../outlook/cursor';
import { type PipedreamConfig, PipedreamConfigSchema } from '../pipedream';
import type { Connector, ConnectorItem, ConnectorTurn, SyncPage } from '../types';
import { type SlackMatch, slackClient } from './client';

// Slack, par Pipedream Connect (pipedream.ts) : l'appli Slack est celle de Pipedream, avec le jeton de
// l'utilisateur ; chaque requête passe par son proxy et coûte 1 crédit. Doc : voir client.ts.
//
// Attention : copier et indexer les messages d'un espace va contre les conditions de Slack telles que
// les lit l'étude docs/etudes/slack-2026-10 (verdict « non indexable »). Branché à la demande de David
// pour l'essai ; à trancher avant un client.
//
// Lecture par la recherche (search.messages, « after:<jour> », du plus ancien au plus récent) : une
// requête rend jusqu'à 100 messages de tous les canaux, au lieu d'une requête par canal et par passage.
// Seuls les canaux (publics ou privés) dont l'utilisateur est membre ; jamais les messages directs ni les
// discussions de groupe. Un élément regroupe les messages d'un canal sur une journée (UTC) ; chaque
// message en est un tour. Le curseur est une position (instant du dernier message lu et identifiants déjà
// lus à cet instant), comme celle d'Outlook.
//
// shortcut: la recherche n'a que le jour pour borne, et deux jours de marge (le fuseau de l'utilisateur) :
// chaque passage relit les messages des deux derniers jours, 1 crédit par centaine. Passer au tri
// décroissant, arrêté au premier message déjà lu, si le volume le justifie.
//
// Non vérifié (aucun compte Slack) : qu'une recherche faite des seuls modificateurs (« after:… ») soit
// acceptée ; que Pipedream accorde search:read ; les champs is_im et is_mpim du canal dans les résultats
// (montrés par l'exemple de la doc ; sans eux, rien n'est lu) ;
// la limite de débit de search.messages (palier 2, une vingtaine de requêtes par minute).

const CursorSchema = z.object({ mark: MarkSchema.nullable() });
const MARGIN_MS = 2 * 24 * 60 * 60 * 1000;

function readMark(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.mark : null;
  } catch {
    return null;
  }
}

// Slack échappe ces trois caractères dans le texte des messages.
const unescapeSlack = (text: string) =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

const instant = (ts: string) => new Date(Math.floor(Number(ts) * 1000)).toISOString();

// Un message direct ou de groupe n'est jamais lu : faute des deux champs, le message est écarté.
const isChannel = ({ channel }: SlackMatch) =>
  channel.is_im === false && channel.is_mpim === false && !channel.id.startsWith('D');
// Un ts n'est unique que dans son canal.
const rowOf = (match: SlackMatch) => ({
  id: `${match.channel.id}:${match.ts}`,
  at: instant(match.ts),
});

function messageTurn(match: SlackMatch): ConnectorTurn | null {
  const text = unescapeSlack(match.text ?? '').trim();
  if (text === '') return null;
  return {
    externalId: `message:${match.ts}`,
    role: 'participant',
    author: { name: match.username || match.user || null, email: null },
    text,
    ts: instant(match.ts),
  };
}

// Les messages d'une page, regroupés par canal et par jour, du groupe le moins récent au plus récent.
export function channelDays(matches: SlackMatch[]): ConnectorItem[] {
  const groups = new Map<string, { match: SlackMatch; turn: ConnectorTurn }[]>();
  for (const match of matches) {
    const turn = messageTurn(match);
    if (!turn) continue;
    const key = `${match.channel.id}:${turn.ts.slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), { match, turn }]);
  }
  const items: ConnectorItem[] = [];
  for (const [key, entries] of groups) {
    const last = entries.at(-1);
    if (!last) continue;
    const name = last.match.channel.name;
    const [year, month, day] = last.turn.ts.slice(0, 10).split('-');
    items.push({
      externalId: `channel:${key}`,
      nature: 'fil',
      title: `${name ? `#${name}` : 'Canal Slack'}, ${day}/${month}/${year}`,
      url: last.match.permalink ?? null,
      updatedAt: last.turn.ts,
      origin: name ? { channel: name } : {},
      turns: entries.map((entry) => entry.turn),
    });
  }
  return items.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

export const slackConnector: Connector<PipedreamConfig> = {
  id: 'slack',
  configSchema: PipedreamConfigSchema,
  secretFields: [],
  hosts: () => ['slack.com'],
  pipedream: { app: 'slack_v2' },
  privateRaw: true, // un canal privé n'est lu que de ses membres

  async verify(_config, http) {
    const me = await slackClient(http).me();
    const account = me.user && me.team ? `${me.user} (${me.team})` : me.user || me.team;
    return { account: account || 'Slack account', accountKey: `${me.team_id}:${me.user_id}` };
  },

  async *sync(_config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    let mark = readMark(cursor);
    const from = new Date((mark ? Date.parse(mark.at) : since.getTime()) - MARGIN_MS);
    for await (const matches of slackClient(http).search(from.toISOString().slice(0, 10))) {
      const before = mark;
      const fresh = matches.filter(
        (match) => Number(match.ts) * 1000 >= since.getTime() && !isDone(before, rowOf(match)),
      );
      for (const match of fresh) mark = advance(mark, rowOf(match));
      if (mark !== before)
        yield { items: channelDays(fresh.filter(isChannel)), cursor: JSON.stringify({ mark }) };
    }
  },
};
