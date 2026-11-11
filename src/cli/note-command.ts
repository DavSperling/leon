// `leon note --tool <outil> [--session <id>] [--note <id> --version <n>] -- "<texte>"` (T57, amendée le 11/11 ; C14, D30,
// D31, D38 du plan de la mémoire à disposition) : le brouillon privé de l'agent de code, par la route des notes
// (API_PATHS.noter), le chemin de `remember`. La phrase du bloc de démarrage la donne, l'outil et la session déjà
// remplis (render-context.ts), avec `--` devant le texte : parseArgs lit ce qui le suit comme du texte, même une puce
// (`- …`).
// - Elle n'envoie que les usages de l'outil de `--tool` (son accord dans ~/.leon/accord.json), jamais ceux d'un autre.
//   Sans accord, ou sans `noter` pour cet outil, rien ne part, et un message fixe le dit.
// - Le texte part masqué en entier (maskSecrets), puis coupé à 4 000 caractères, comme le rappel ; le serveur le masque
//   de nouveau. Avec le projet du dossier courant (INIT_CWD sous pnpm), l'outil et la session déclarée.
// - L'id et le numéro de la version écrite vont sur la sortie standard, rien sur le disque (D31). Toute réponse du
//   serveur autre qu'une note écrite donne un message fixe sur la sortie d'erreur, qui ne recopie jamais le texte, et
//   le code 0 (M : la CLI tolère les 404 et 400 des nouvelles routes). Seule une erreur d'usage lève (code 1).
import { parseArgs } from 'node:util';
import {
  API_PATHS,
  NOTE_TEXTE_MAX,
  NOTER_BODY_MAX_BYTES,
  type NoterRequest,
  NoterRequestSchema,
  NoterResponseSchema,
} from '../capture/api-contract';
import { maskSecrets } from '../capture/mask-secrets';
import { CODE_SESSION_KINDS, type CodeSessionKind } from '../capture/turn';
import { briefingDirectory } from './briefing';
import { factsConsent } from './consent';
import { resolveServerEnv } from './env';
import { type GitRunner, projectKeyFor } from './project-key';

// Une écriture : plus que les 3 s du bloc de démarrage, moins que la recherche.
const TIMEOUT_MS = 10_000;

export const notesNotAllowedMessage = (tool: CodeSessionKind) =>
  `Leon: ${tool} has not accepted writing notes to Leon from this computer (the \`noter\` consent): nothing was sent. To accept it, run \`~/.leon/bin/leon setup\` in a terminal.`;
export const NOTE_ROUTE_MISSING_MESSAGE =
  'Leon: this Leon server does not have `leon note` yet (route missing).';
export const NOTE_REFUSED_MESSAGE =
  'Leon: the Leon server refused the note (the `noter` consent of this tool is missing): nothing was saved.';
export const NOTE_CONFLICT_MESSAGE =
  'Leon: note not saved: its last version is not the one given with --version, it was written by another tool, or it does not exist. Read it with `leon versions <id>`.';

export type NoteDeps = {
  env: Record<string, string | undefined>;
  home: string;
  cwd: string;
  git: GitRunner;
  fetch: typeof fetch;
  out: (text: string) => void;
  err: (text: string) => void;
};

const TOOLS_HINT = `--tool <tool> (${CODE_SESSION_KINDS.join(', ')})`;

// Les arguments de la commande, validés ; une erreur d'usage lève.
function parse(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      tool: { type: 'string' },
      session: { type: 'string' },
      note: { type: 'string' },
      version: { type: 'string' },
    },
  });
  const tool = CODE_SESSION_KINDS.find((kind) => kind === values.tool);
  if (tool === undefined) throw new Error(`leon note needs ${TOOLS_HINT}.`);
  const text = positionals.join(' ');
  if (text.trim() === '')
    throw new Error('leon note needs a text: leon note --tool <tool> -- "<text>".');
  const { session, note, version } = values;
  if (session !== undefined && !NoterRequestSchema.shape.session.safeParse(session).success) {
    throw new Error('leon note: --session takes 1 to 200 characters.');
  }
  if ((note === undefined) !== (version === undefined)) {
    throw new Error(
      'leon note: give --note and --version together, to write the next version of a note.',
    );
  }
  if (note !== undefined && !NoterRequestSchema.shape.note.safeParse(note).success) {
    throw new Error('leon note: --note takes the id of a note (a uuid, as leon note prints it).');
  }
  if (version !== undefined && !/^[1-9]\d{0,8}$/.test(version)) {
    throw new Error(
      'leon note: --version takes the number of the last version you read (1, 2, 3…).',
    );
  }
  return {
    tool,
    text,
    session,
    note,
    version: version === undefined ? undefined : Number(version),
  };
}

export async function runNoteCommand(args: string[], deps: NoteDeps): Promise<number> {
  const { tool, text, session, note, version } = parse(args);
  const consent = await factsConsent(deps.home, tool);
  if (!consent?.usages.includes('noter')) {
    deps.err(notesNotAllowedMessage(tool));
    return 0;
  }
  let server: Awaited<ReturnType<typeof resolveServerEnv>>;
  try {
    server = await resolveServerEnv(deps.env, deps.home);
  } catch (error) {
    // Messages fixes : ils ne recopient ni le jeton ni une adresse.
    deps.err(`Leon: ${error instanceof Error ? error.message : 'invalid configuration.'}`);
    return 0;
  }
  const body: NoterRequest = {
    projet: await projectKeyFor(briefingDirectory('', deps.env, deps.cwd), deps.git),
    outil: tool,
    ...(session === undefined ? {} : { session }),
    // Masqué en entier, puis coupé : coupé d'abord, un secret à cheval sur la borne serait trop court pour son motif
    // et partirait en morceau. Bien formé : la coupe peut tomber au milieu d'un émoji.
    texte: maskSecrets(text).slice(0, NOTE_TEXTE_MAX).toWellFormed(),
    ...(note === undefined || version === undefined ? {} : { note, version }),
    usages: consent.usages,
  };
  // Une note trop lourde pour la route une fois en JSON : refusée ici, sans rien envoyer.
  const json = JSON.stringify(body);
  if (Buffer.byteLength(json) > NOTER_BODY_MAX_BYTES) {
    throw new Error('leon note: this note is too long.');
  }
  let response: Response;
  try {
    response = await deps.fetch(new URL(API_PATHS.noter, server.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' },
      body: json,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    deps.err('Leon: leon note unavailable (server unreachable or too slow).');
    return 0;
  }
  if (response.status === 404) deps.err(NOTE_ROUTE_MISSING_MESSAGE);
  else if (response.status === 403) deps.err(NOTE_REFUSED_MESSAGE);
  else if (response.status === 409) deps.err(NOTE_CONFLICT_MESSAGE);
  else if (response.status === 400) {
    deps.err('Leon: the Leon server refused this note as invalid: nothing was saved.');
  } else if (response.status === 401) deps.err('Leon: token refused by the Leon server.');
  else if (!response.ok) {
    deps.err(`Leon: leon note unavailable (response ${response.status} from the server).`);
  } else {
    const parsed = NoterResponseSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) {
      const { id, n } = parsed.data;
      deps.out(`Note ${id}, version ${n}. To write its next version: --note ${id} --version ${n}`);
    } else deps.err('Leon: leon note unavailable (unexpected response from the server).');
  }
  return 0;
}
