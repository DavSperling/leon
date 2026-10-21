import type { LucideIcon } from 'lucide-react';
import { Code, FileText, GitBranch, Globe, LifeBuoy, Mail, Mic, Monitor, PenLine, Plug, SquareKanban, Terminal, Users } from 'lucide-react';
import { CATALOG } from './catalog';

// Les 39 outils branchables, leurs familles, et les quatre canaux de capture (libellés du vrai Leon).

export const FAMILIES = [
  { id: 'dev', label: 'Dev', icon: Code },
  { id: 'reunions', label: 'Réunions', icon: Mic },
  { id: 'projet', label: 'Projet', icon: SquareKanban },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'mails', label: 'Mails et agenda', icon: Mail },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: LucideIcon }>;
export type Family = (typeof FAMILIES)[number]['id'];

const TOOLS = {
  github: ['GitHub', 'dev'], linear: ['Linear', 'dev'], notion: ['Notion', 'dev'],
  circleback: ['Circleback', 'reunions'], claap: ['Claap', 'reunions'], fathom: ['Fathom', 'reunions'],
  fireflies: ['Fireflies', 'reunions'], gong: ['Gong', 'reunions'], granola: ['Granola', 'reunions'],
  leexi: ['Leexi', 'reunions'], tldv: ['tl;dv', 'reunions'],
  airtable: ['Airtable', 'projet'], asana: ['Asana', 'projet'], basecamp: ['Basecamp', 'projet'],
  clickup: ['ClickUp', 'projet'], confluence: ['Confluence', 'projet'], gitlab: ['GitLab', 'projet'],
  jira: ['Jira', 'projet'], miro: ['Miro', 'projet'], monday: ['monday.com', 'projet'], plane: ['Plane', 'projet'],
  productboard: ['Productboard', 'projet'], sentry: ['Sentry', 'projet'], shortcut: ['Shortcut', 'projet'],
  trello: ['Trello', 'projet'],
  attio: ['Attio', 'crm'], close: ['Close', 'crm'], folk: ['folk', 'crm'], hubspot: ['HubSpot', 'crm'],
  pipedrive: ['Pipedrive', 'crm'],
  crisp: ['Crisp', 'support'], freshdesk: ['Freshdesk', 'support'], front: ['Front', 'support'],
  helpscout: ['Help Scout', 'support'], intercom: ['Intercom', 'support'], missive: ['Missive', 'support'],
  plain: ['Plain', 'support'], zendesk: ['Zendesk', 'support'],
  outlook: ['Outlook', 'mails'],
} as const satisfies Record<string, readonly [string, Family]>;
export type ProviderId = keyof typeof TOOLS;

export type CatalogField = {
  name: string;
  label: string;
  /** list = une valeur par ligne (textarea) */
  kind: 'secret' | 'text' | 'list' | 'select';
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};
export type CatalogEntry = {
  fields: CatalogField[];
  /** Où trouver la clé ; suivi du lien « Où trouver la clé ↗ » vers docsUrl. */
  keyHelp: string;
  docsUrl: string;
  /** Ce que l'éditeur demandera derrière le bouton « Se connecter avec … » (présent = OAuth). */
  oauthHelp?: string;
  /** false : l'outil ne se branche que par le bouton. */
  keyAccepted?: boolean;
  /** Ligne d'avertissement (TriangleAlert) dans la fenêtre de branchement. */
  warning?: string;
};

export type Provider = CatalogEntry & {
  id: ProviderId;
  label: string;
  family: Family;
  oauth: boolean;
  keyAccepted: boolean;
  /** Toujours faux aujourd'hui : chaque outil porte l'étiquette « Non essayé en réel ». */
  triedForReal: false;
};

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

/** Les 39 outils, par famille (ordre de FAMILIES) puis par libellé en ordre français. */
export const PROVIDERS: Provider[] = (Object.entries(TOOLS) as Array<[ProviderId, readonly [string, Family]]>)
  .map(([id, [label, family]]) => ({
    ...CATALOG[id], id, label, family,
    oauth: Boolean(CATALOG[id].oauthHelp),
    keyAccepted: CATALOG[id].keyAccepted !== false,
    triedForReal: false as const,
  }))
  .sort((a, b) => FAMILIES.findIndex((f) => f.id === a.family) - FAMILIES.findIndex((f) => f.id === b.family) || collator.compare(a.label, b.label));

export const getProvider = (id: ProviderId): Provider => PROVIDERS.find((p) => p.id === id)!;
export const providersOf = (family: Family): Provider[] => PROVIDERS.filter((p) => p.family === family);

// Canaux de capture des conversations IA (pas des connecteurs).
export const CAPTURE_CHANNELS = [
  { id: 'claude_code', label: 'Claude Code', icon: Terminal },
  { id: 'claude_ai', label: 'claude.ai', icon: Globe },
  { id: 'chatgpt', label: 'ChatGPT', icon: Globe },
  { id: 'mcp_remember', label: 'Note MCP', icon: PenLine },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: LucideIcon }>;
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number]['id'];

/** Toute origine d'une source : un outil branché ou un canal de capture. */
export type SourceKind = ProviderId | CaptureChannel;

const isProvider = (k: string): k is ProviderId => Object.hasOwn(TOOLS, k);

export function kindLabel(kind: SourceKind): string {
  return isProvider(kind) ? TOOLS[kind][0] : CAPTURE_CHANNELS.find((c) => c.id === kind)!.label;
}

// Les outils que la planche dessine ont leur propre icône (un commit, un ticket et une page se distinguent d'un coup d'œil).
const TOOL_ICONS: Partial<Record<ProviderId, LucideIcon>> = { github: GitBranch, linear: SquareKanban, notion: FileText, fathom: Mic, hubspot: Users, outlook: Mail };

/** Icône d'une origine : celle de l'outil (planche) ou de sa famille, le canal pour une capture ; Monitor pour l'interface, Plug sinon. */
export function kindIcon(kind: SourceKind | 'interface' | 'other'): LucideIcon {
  if (isProvider(kind)) return TOOL_ICONS[kind] ?? FAMILIES.find((f) => f.id === TOOLS[kind][1])!.icon;
  if (kind === 'interface') return Monitor;
  return CAPTURE_CHANNELS.find((c) => c.id === kind)?.icon ?? Plug;
}

export const NATURES = ['conversation', 'reunion', 'page', 'ticket', 'fil', 'note', 'mail', 'fichier', 'evenement', 'commit'] as const;
export type Nature = (typeof NATURES)[number];
export const NATURE_LABELS: Record<Nature, string> = {
  conversation: 'Conversation IA', reunion: 'Réunion', page: 'Page', ticket: 'Ticket', fil: 'Fil', note: 'Note',
  mail: 'Mail', fichier: 'Fichier', evenement: 'Évènement', commit: 'Modification de code',
};
