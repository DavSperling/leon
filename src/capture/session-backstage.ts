import { z } from 'zod';
import { type CoulisseBloc, CoulisseBlocSchema, TEXTE_MAX } from './api-contract';
import { messageText, SUBAGENT_TOOLS } from './claude-code';
import { prepareTurnText } from './prepare-turn-text';
import {
  factText,
  isFinalReport,
  LineSchema,
  reduceCommand,
  reduceToolName,
  repoRelativePath,
  type Subagents,
  ToolResultSchema,
  ToolUseSchema,
} from './session-facts';
import { stripLeonBlocks } from './strip-leon-blocks';

const BackstageLineSchema = LineSchema.extend({ uuid: z.string().optional() });
type BackstageLine = z.infer<typeof BackstageLineSchema>;
const ThinkingSchema = z.object({ type: z.literal('thinking'), thinking: z.string() });
const PromptSchema = z.object({ prompt: z.string() });
// Les seuls arguments lus pour la cible : jamais un motif, une URL, une requête ni une consigne.
const TargetSchema = z.object({
  command: z.string().optional(),
  file_path: z.string().optional(),
  notebook_path: z.string().optional(),
  path: z.string().optional(),
});
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Glob', 'Grep', 'LS']);

function parseLine(raw: string): BackstageLine | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = BackstageLineSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// Un raisonnement, une consigne ou un rapport, préparé comme un tour de la session ; null : rien à envoyer.
const prepare = (raw: string) => prepareTurnText(stripLeonBlocks(raw));

// La cible d'un appel (C10 amendé le 12/11) : la commande réduite de Bash, le chemin dans le dépôt d'un outil de
// fichier ou le `path` d'une recherche ; rien pour tout autre outil.
function target(name: string, input: unknown, root: string | null): string | undefined {
  const parsed = TargetSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const { command, file_path, notebook_path, path } = parsed.data;
  if (name === 'Bash')
    return command === undefined ? undefined : reduceCommand(command) || undefined;
  const file = FILE_TOOLS.has(name)
    ? (file_path ?? notebook_path)
    : SEARCH_TOOLS.has(name)
      ? path
      : undefined;
  const kept = file === undefined ? null : repoRelativePath(file, root);
  return kept === null ? undefined : factText(kept, TEXTE_MAX);
}

// Les coulisses d'une session Claude Code (T52, C10 amendé le 12/11), dans l'ordre du temps : le raisonnement de la
// session, la consigne et le rapport de chaque sous-agent, et chaque appel d'outil réduit, ceux des sous-agents compris
// (`subagents` : la table de loadSubagents). Jamais la sortie d'un outil : son tool_result ne sert qu'au statut. Le
// raisonnement d'un sous-agent ne part pas (D29). `root` : la racine du dépôt, comme pour les faits.
export function extractBackstage(
  content: string,
  root: string | null,
  subagents: Subagents,
): CoulisseBloc[] {
  const blocs: CoulisseBloc[] = [];
  const seen = new Set<string>();
  const errors = new Map<string, boolean>();
  const push = (bloc: CoulisseBloc): boolean => {
    if (seen.has(bloc.id)) return false;
    seen.add(bloc.id);
    blocs.push(bloc);
    return true;
  };

  // Rend la dernière ligne de conversation du fichier, pour la règle du rapport final.
  function read(file: string, session: boolean): BackstageLine | null {
    let last: BackstageLine | null = null;
    for (const raw of file.split('\n')) {
      const line = parseLine(raw);
      // Les blocs ne se lisent que sur les messages : les lignes api-request-blob en recopient (annexe 08).
      if (!line || (line.type !== 'user' && line.type !== 'assistant')) continue;
      // Dans la session, une ligne isSidechain est l'ancienne forme d'un sous-agent, pas la session.
      if (session && line.isSidechain) continue;
      last = line;
      const ts = line.timestamp;
      const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
      for (const [index, block] of blocks.entries()) {
        const result = ToolResultSchema.safeParse(block);
        if (result.success && !errors.has(result.data.tool_use_id))
          errors.set(result.data.tool_use_id, result.data.is_error === true);
        if (ts === undefined) continue;
        const thinking = ThinkingSchema.safeParse(block);
        const texte =
          session && thinking.success && line.uuid ? prepare(thinking.data.thinking) : null;
        // Le rang du bloc précise l'uuid de la ligne, pour une ligne qui en porterait plusieurs.
        if (texte !== null) push({ role: 'raisonnement', id: `${line.uuid}:${index}`, ts, texte });
        const call = ToolUseSchema.safeParse(block);
        if (!call.success) continue;
        const { id, name, input } = call.data;
        const cible = target(name, input, root);
        const appel: CoulisseBloc = {
          role: 'appel_outil',
          id,
          ts,
          outil: reduceToolName(name),
          ...(cible === undefined ? {} : { cible }),
          statut: 'sans_resultat', // revu à la fin, une fois tous les tool_result lus
        };
        // Un même appel peut revenir sur deux lignes : son sous-agent n'est lu qu'une fois.
        if (push(appel) && SUBAGENT_TOOLS.has(name)) subagent(id, ts, input);
      }
    }
    return last;
  }

  // La consigne part seule si le fichier manque ou s'arrête avant le rapport final (coupé, ou encore en cours).
  function subagent(id: string, ts: string, input: unknown): void {
    const prompt = PromptSchema.safeParse(input);
    const consigne = prompt.success ? prepare(prompt.data.prompt) : null;
    if (consigne !== null)
      push({ role: 'sous_agent', id: `${id}:consigne`, ts, partie: 'consigne', texte: consigne });
    const file = subagents.get(id);
    const last = file === undefined ? null : read(file, false);
    if (!last?.timestamp || !last.message || !isFinalReport(last)) return;
    const rapport = prepare(messageText(last.message.content));
    if (rapport !== null)
      push({
        role: 'sous_agent',
        id: `${id}:rapport`,
        ts: last.timestamp,
        partie: 'rapport',
        texte: rapport,
      });
  }

  read(content, true);
  for (const bloc of blocs) {
    if (bloc.role !== 'appel_outil') continue;
    const error = errors.get(bloc.id);
    bloc.statut = error === undefined ? 'sans_resultat' : error ? 'erreur' : 'ok';
  }
  // Un bloc hors du contrat (un identifiant hors forme) ferait refuser tout l'envoi : il est écarté. Le tri est
  // stable : à date égale, l'appel précède sa consigne.
  return blocs
    .filter((bloc) => CoulisseBlocSchema.safeParse(bloc).success)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}
