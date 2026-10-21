import { formatRelative, minutesAgo, NOW } from '@/lib/format';
import { nb } from '@/lib/nb';
import { CORPUS } from './corpus';
import { CAPTURE_CHANNELS, type CaptureChannel, kindLabel, type SourceKind } from './providers';

// Page Sources : santé des canaux de capture et liste brute des sources (conversations captées + éléments des outils).

export type IndexingStatus = 'running' | 'done' | 'failed';
export type SourceRow = {
  id: string;
  kind: SourceKind;
  kindLabel: string;
  title: string | null;
  url: string | null;
  author: string | null;
  lastTurnAt: Date | null;
  turns: number;
  /** null : pas encore indexée (« — », lecteur d'écran « Pas encore indexée ») */
  indexing: IndexingStatus | null;
};

export type ChannelStatus = {
  channel: CaptureChannel;
  label: string;
  lastCaptureAt: Date | null;
  /** Plus de 24 h sans capture : pastille d'avertissement (TriangleAlert). */
  late: boolean;
  /** « Claude Code : dernière capture il y a 4 min » */
  text: string;
};

const DAY = 86_400_000;
const LAST: Record<CaptureChannel, Date | null> = {
  claude_code: minutesAgo(4),
  claude_ai: null,
  chatgpt: new Date(NOW.getTime() - 3 * DAY - 30 * 60_000),
  mcp_remember: minutesAgo(120),
};

export const CHANNEL_STATUS: ChannelStatus[] = CAPTURE_CHANNELS.map(({ id, label }) => {
  const last = LAST[id];
  const late = last !== null && NOW.getTime() - last.getTime() > DAY;
  const text = !last ? 'aucune capture' : late ? `aucune capture depuis ${Math.floor((NOW.getTime() - last.getTime()) / DAY)} j` : `dernière capture ${formatRelative(last)}`;
  return { channel: id, label, lastCaptureAt: last, late, text: nb(`${label} : ${text}`) };
});

// Conversations captées en plus du corpus (titres tels que les assistants les nomment).
const CAPTURED: Array<[CaptureChannel, string | null, number, number, IndexingStatus | null]> = [
  // [canal, titre, minutes écoulées, tours, indexation]
  ['claude_code', 'Migration du schéma des passages', 9, 34, 'running'],
  ['claude_code', 'Corriger le verrou de la file d’indexation', 52, 18, 'done'],
  ['claude_code', 'Pagination côté serveur de l’export CSV', 60 * 5, 26, 'done'],
  ['claude_code', 'Revue de la PR #131 (export SAML)', 60 * 21, 12, 'done'],
  ['claude_code', null, 60 * 26, 3, 'failed'],
  ['claude_code', 'Ajouter un index sur sources.updated_at', 60 * 30, 9, 'done'],
  ['claude_code', 'Tests du parseur de requêtes', 60 * 44, 21, 'done'],
  ['claude_code', 'Réécrire le connecteur Granola', 60 * 50, 40, 'done'],
  ['claude_code', 'Débogage du flux SSE des discussions', 60 * 70, 31, 'done'],
  ['claude_code', 'Script d’import Claude Code', 60 * 75, 14, 'done'],
  ['claude_code', 'Nettoyer les migrations de septembre', 60 * 96, 8, 'done'],
  ['claude_code', 'Limiter les lectures par réponse', 60 * 120, 17, 'done'],
  ['claude_code', 'Chiffrement des clés des connecteurs', 60 * 150, 22, 'done'],
  ['claude_code', 'Benchmark de la recherche sémantique', 60 * 190, 11, 'done'],
  ['claude_code', 'Résumé des journaux de production', 60 * 220, 6, 'failed'],
  ['claude_code', 'Composant de pagination', 60 * 260, 10, 'done'],
  ['claude_code', 'Erreurs 429 du modèle', 60 * 300, 7, 'done'],
  ['claude_code', 'Purge des sources supprimées', 60 * 340, 13, 'done'],
  ['mcp_remember', 'Décision : plafond de dépenses confirmé', 60 * 5, 1, 'done'],
  ['mcp_remember', 'Contact juridique ACME', 60 * 46, 1, 'done'],
  ['mcp_remember', 'Mot de passe Wi-Fi des bureaux : voir 1Password', 60 * 100, 1, null],
  ['mcp_remember', 'Choix de Scaleway pour les sauvegardes', 60 * 170, 1, 'done'],
  ['chatgpt', 'Reformuler l’annonce du poste backend', 60 * 80, 6, 'done'],
  ['chatgpt', 'Questions d’entretien sur Postgres', 60 * 98, 9, 'done'],
  ['chatgpt', 'Plan du webinaire Zéphyr', 60 * 160, 12, 'done'],
  ['chatgpt', 'Traduction des conditions générales', 60 * 240, 4, null],
  ['chatgpt', 'Idées de nom pour le plan Équipe', 60 * 330, 15, 'done'],
  ['chatgpt', 'Courriel de bienvenue client', 60 * 410, 5, 'done'],
  ['claude_code', 'Premier jet de la page Connexions', 60 * 460, 28, 'done'],
  ['claude_code', 'Pourquoi la CI est lente', 60 * 520, 16, 'done'],
];

const fromCorpus: SourceRow[] = CORPUS.map((i) => ({
  id: i.id, kind: i.kind, kindLabel: kindLabel(i.kind), title: i.title, url: i.url, author: i.author,
  lastTurnAt: i.date, turns: i.turns.length,
  indexing: i.id === 'cc-ranking' ? 'running' : i.id === 'intercom-sso-nova' ? 'failed' : 'done',
}));
const captured: SourceRow[] = CAPTURED.map(([kind, title, ago, turns, indexing], i) => ({
  id: `cap-${i + 1}`, kind, kindLabel: kindLabel(kind), title, url: kind === 'chatgpt' ? `https://chatgpt.com/c/cap-${i + 1}` : null,
  author: 'Vous', lastTurnAt: minutesAgo(ago + (kind === 'chatgpt' ? 3 * 1440 + 30 : 0)), turns, indexing,
}));
const pending: SourceRow = { id: 'cap-vide', kind: 'claude_code', kindLabel: 'Claude Code', title: null, url: null, author: 'Vous', lastTurnAt: null, turns: 0, indexing: null };

/** ~70 sources, de la plus récente à la plus ancienne (sans tour en dernier). */
export const SOURCES: SourceRow[] = [...fromCorpus, ...captured, pending].sort(
  (a, b) => (b.lastTurnAt?.getTime() ?? 0) - (a.lastTurnAt?.getTime() ?? 0),
);
export const SOURCES_PAGE_SIZE = 50;
export const sourcesPage = (page: number): SourceRow[] => SOURCES.slice((page - 1) * SOURCES_PAGE_SIZE, page * SOURCES_PAGE_SIZE);
