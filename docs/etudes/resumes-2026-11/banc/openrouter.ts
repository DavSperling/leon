// Un appel à OpenRouter (API compatible OpenAI). Le coût vient d'OpenRouter lui-même (usage.cost, en dollars) :
// c'est le montant débité, réflexion comprise. Aucune donnée réelle ne passe ici : seulement les jeux d'essai.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDER } from '@/server/llm/openrouter-llm';

const URL_API = 'https://openrouter.ai/api/v1/chat/completions';

// La clé vit dans le .env.local du clone principal (jamais dans le dépôt) ; OPENROUTER_API_KEY l'emporte.
export function cle(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  for (const fichier of [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', '..', '..', '.env.local'),
  ]) {
    try {
      const ligne = readFileSync(fichier, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('OPENROUTER_API_KEY='));
      const valeur = ligne?.slice('OPENROUTER_API_KEY='.length).trim();
      if (valeur) return valeur;
    } catch {}
  }
  throw new Error('OPENROUTER_API_KEY introuvable');
}

export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AppelOutil[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type AppelOutil = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type Outil = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type Usage = {
  entree: number;
  sortie: number;
  reflexion: number;
  cache: number;
  cout: number;
};
export type Reponse = {
  texte: string;
  appels: AppelOutil[];
  fin: string | null;
  usage: Usage;
  fournisseur: string | null;
  latenceMs: number;
};

export const usageVide = (): Usage => ({ entree: 0, sortie: 0, reflexion: 0, cache: 0, cout: 0 });
export const ajouter = (a: Usage, b: Usage): Usage => ({
  entree: a.entree + b.entree,
  sortie: a.sortie + b.sortie,
  reflexion: a.reflexion + b.reflexion,
  cache: a.cache + b.cache,
  cout: a.cout + b.cout,
});

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Le même bloc que Leon en production (sans rétention, sans 4 bits, sans hôte chinois).
export const ROUTAGE_ZDR = PROVIDER;

type Requete = {
  modele: string;
  messages: Message[];
  maxTokens: number;
  effort: 'none' | 'low' | 'medium' | 'high';
  outils?: Outil[];
};

export async function appeler(requete: Requete): Promise<Reponse> {
  // ANTHROPIC=direct : les modèles Claude passent par l'API d'Anthropic (comme Leon), sans crédit OpenRouter.
  if (process.env.ANTHROPIC === 'direct' && requete.modele.startsWith('anthropic/')) return appelerAnthropic(requete);
  const corps = {
    model: requete.modele,
    messages: requete.messages,
    max_tokens: requete.maxTokens,
    // Le même effort que Leon donne à l'étape (models.ts) ; la réflexion est facturée, pas renvoyée.
    reasoning: requete.effort === 'none' ? { enabled: false } : { effort: requete.effort, exclude: true },
    usage: { include: true },
    ...(requete.outils ? { tools: requete.outils } : {}),
    // ROUTAGE=zdr : le routage que Leon aurait en production avec des données de clients : des hébergeurs sans
    // conservation des données (ZDR), qui n'entraînent rien dessus, et pas de version compressée en 4 bits.
    ...(process.env.ROUTAGE === 'zdr' ? { provider: ROUTAGE_ZDR } : {}),
  };
  let derniere: unknown;
  for (let essai = 0; essai < 4; essai++) {
    const debut = Date.now();
    try {
      const res = await fetch(URL_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cle()}`,
          'Content-Type': 'application/json',
          'X-Title': 'banc-resumes',
        },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(240_000),
      });
      const texte = await res.text();
      if (res.status === 429 || res.status >= 500) {
        derniere = new Error(`HTTP ${res.status} ${texte.slice(0, 200)}`);
        await pause(2000 * 2 ** essai);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${texte.slice(0, 300)}`);
      const json = JSON.parse(texte);
      if (json.error) {
        derniere = new Error(`erreur ${JSON.stringify(json.error).slice(0, 300)}`);
        await pause(2000 * 2 ** essai);
        continue;
      }
      const choix = json.choices?.[0];
      const u = json.usage ?? {};
      return {
        texte: typeof choix?.message?.content === 'string' ? choix.message.content : '',
        appels: choix?.message?.tool_calls ?? [],
        fin: choix?.finish_reason ?? null,
        usage: {
          entree: u.prompt_tokens ?? 0,
          sortie: u.completion_tokens ?? 0,
          reflexion: u.completion_tokens_details?.reasoning_tokens ?? 0,
          cache: u.prompt_tokens_details?.cached_tokens ?? 0,
          cout: u.cost ?? 0,
        },
        fournisseur: json.provider ?? null,
        latenceMs: Date.now() - debut,
      };
    } catch (e) {
      derniere = e;
      if (e instanceof Error && e.message.startsWith('HTTP 4')) break;
      await pause(2000 * 2 ** essai);
    }
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere));
}

// --- Anthropic en direct ---

// Dollars par million de jetons (src/server/llm/models.ts).
const PRIX_CLAUDE: Record<string, { entree: number; sortie: number; lu: number; ecrit: number }> = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5, lu: 0.01, ecrit: 0.125 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10, lu: 0.1, ecrit: 2.5 },
  'claude-opus-5-5': { entree: 4, sortie: 20, lu: 0.2, ecrit: 5 },
};

function cleAnthropic(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  for (const fichier of [join(process.cwd(), '.env.local'), join(process.cwd(), '..', '..', '..', '.env.local')]) {
    try {
      const ligne = readFileSync(fichier, 'utf8').split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
      const valeur = ligne?.slice('ANTHROPIC_API_KEY='.length).trim();
      if (valeur) return valeur;
    } catch {}
  }
  throw new Error('ANTHROPIC_API_KEY introuvable');
}

// Les messages au format OpenAI deviennent ceux de l'API d'Anthropic : les résultats d'outils qui se suivent vont
// dans un seul message `user`, comme le fait anthropic-llm.ts.
function versAnthropic(messages: Message[]) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content as string).join('\n\n');
  const sortie: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const bloc = { type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content };
      const dernier = sortie.at(-1);
      if (dernier?.role === 'user' && Array.isArray(dernier.content)) (dernier.content as unknown[]).push(bloc);
      else sortie.push({ role: 'user', content: [bloc] });
    } else if (m.role === 'assistant') {
      const blocs: unknown[] = m.content ? [{ type: 'text', text: m.content }] : [];
      for (const a of m.tool_calls ?? []) {
        blocs.push({ type: 'tool_use', id: a.id, name: a.function.name, input: JSON.parse(a.function.arguments || '{}') });
      }
      sortie.push({ role: 'assistant', content: blocs });
    } else sortie.push({ role: 'user', content: m.content });
  }
  return { system, messages: sortie };
}

async function appelerAnthropic(requete: Requete): Promise<Reponse> {
  const modele = requete.modele.replace('anthropic/', '').replace(/\.(\d)$/, '-$1').replace(/\./g, '-');
  const prix = PRIX_CLAUDE[modele];
  if (!prix) throw new Error(`prix inconnu : ${modele}`);
  const { system, messages } = versAnthropic(requete.messages);
  const corps = {
    model: modele,
    max_tokens: requete.maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
    ...(requete.effort === 'none' ? {} : { output_config: { effort: requete.effort } }),
    ...(requete.outils
      ? { tools: requete.outils.map((o) => ({ name: o.function.name, description: o.function.description, input_schema: o.function.parameters })) }
      : {}),
  };
  let derniere: unknown;
  for (let essai = 0; essai < 4; essai++) {
    const debut = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cleAnthropic(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(240_000),
    }).catch((e) => e as Error);
    if (res instanceof Error) {
      derniere = res;
      await pause(2000 * 2 ** essai);
      continue;
    }
    const texte = await res.text();
    if (res.status === 429 || res.status >= 500) {
      derniere = new Error(`HTTP ${res.status} ${texte.slice(0, 200)}`);
      await pause(4000 * 2 ** essai);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${texte.slice(0, 300)}`);
    const json = JSON.parse(texte);
    const blocs: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = json.content ?? [];
    const u = json.usage ?? {};
    const lu = u.cache_read_input_tokens ?? 0;
    const ecrit = u.cache_creation_input_tokens ?? 0;
    const cout = (u.input_tokens * prix.entree + u.output_tokens * prix.sortie + lu * prix.lu + ecrit * prix.ecrit) / 1e6;
    const FIN: Record<string, string> = { end_turn: 'stop', max_tokens: 'length', tool_use: 'tool_calls', refusal: 'content_filter' };
    return {
      texte: blocs.filter((b) => b.type === 'text').map((b) => b.text).join(''),
      appels: blocs
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id as string, type: 'function' as const, function: { name: b.name as string, arguments: JSON.stringify(b.input) } })),
      fin: FIN[json.stop_reason] ?? json.stop_reason,
      usage: { entree: u.input_tokens + lu + ecrit, sortie: u.output_tokens, reflexion: 0, cache: lu, cout },
      fournisseur: 'Anthropic (direct)',
      latenceMs: Date.now() - debut,
    };
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere));
}
