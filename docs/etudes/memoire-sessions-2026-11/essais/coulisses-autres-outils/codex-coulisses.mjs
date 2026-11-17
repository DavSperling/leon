#!/usr/bin/env node
// Le témoin des coulisses de Codex (essai de la PR 4 du lot 14), sur le modèle de claude-code-coulisses.mjs. Il relève
// la FORME des rollouts d'une session de test : sous quelle forme Codex écrit le raisonnement de l'agent, les appels
// d'outils et les échanges des sous-agents. Node seul, sans dépendance.
//
//   node codex-coulisses.mjs <CODEX_HOME de l'essai> <dossier d'essai>   (chemins absolus)
//
// Il écrit un rapport JSON indenté sur la sortie standard, et rien sur le disque. Dans le CODEX_HOME, il ne lit que les
// rollouts `sessions/**/rollout-*.jsonl` ; du reste (auth.json, history.jsonl, config.toml…), seulement les noms connus
// et les tailles du premier niveau.
//
// Règle n°1, la forme, jamais un texte. Une valeur ne s'affiche que si elle est dans la liste fermée de sa clé (VALEURS :
// types, rôles, statuts, outils natifs…), ou un petit entier sous `exit_code`/`depth`. Un identifiant (sous une clé
// d'identifiant) ne s'affiche jamais : il devient un pseudonyme, le même pour le même identifiant le temps du relevé, et
// sa seule forme (uuid, call_…), y compris l'UUID du nom d'un rollout. Toute autre valeur s'affiche comme son type et sa longueur. Un nom de clé ne se note que
// s'il est dans la liste fermée CLES, sinon sa longueur. Sous les arguments d'un appel, aucune valeur ; sous une sortie
// d'outil, des clés qui sont des données (`changes`) ou une clé hors de CLES, ni valeur ni nom de clé. Un type ou un
// outil hors des listes est compté dans `formes_inconnues`. Un nom de fichier ne se note que s'il est connu ou a la forme
// d'un rollout ; au-delà de PROFONDEUR niveaux, rien n'est lu.
//
// Règle n°2, deux gardes contre les vraies sessions. Le script refuse de tourner (code 2) si le nom du CODEX_HOME ou du
// dossier d'essai (donnés et réels) ne porte pas le jeton `leon-essai-coulisses`, ou si `sessions` n'est pas un vrai
// dossier (un lien vers le vrai magasin de Codex). Il ne suit aucun lien. Puis un rollout n'est relevé que si sa première
// ligne est un `session_meta` dont le dossier de travail (`cwd`, absolu, `..` résolus, et son chemin réel s'il existe)
// est le dossier d'essai ou est sous lui, et si aucun autre `session_meta` ou `turn_context` ne porte un autre dossier.
// Ces champs se lisent, ne s'affichent jamais ; un rollout qui ne passe pas est seulement compté (sans en-tête lisible,
// ou hors garde). Un fichier illisible est compté, et le relevé continue.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path';

const JETON = 'leon-essai-coulisses';
const PROFONDEUR = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXE = /^(?:call|fc|ws|rs|msg|ctc)_/;
const ROLLOUT = /^(?:\d{2}|\d{4}|rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jsonl)$/i;
const ens = (mots) => new Set(mots.split(/\s+/).filter(Boolean));
const OUTILS = ens(`exec_command shell shell_command local_shell apply_patch update_plan view_image write_stdin spawn_agent
  send_input wait close_agent resume_agent web_search request_user_input request_permissions get_context_remaining
  unified_exec_interaction tool_search list_mcp_resources list_mcp_resource_templates read_mcp_resource current_time sleep
  wait_for_environment new_context_window container.exec`);
// Les valeurs qui s'affichent, par clé (codex.ts, annexe 03). Toute autre valeur se masque.
const VALEURS = new Map(Object.entries({
  type: ens(`session_meta turn_context response_item event_msg compacted message reasoning function_call
    function_call_output custom_tool_call custom_tool_call_output local_shell_call web_search_call tool_search_call
    image_generation_call input_text output_text input_image summary_text reasoning_text text refusal agent_reasoning
    agent_reasoning_raw_content agent_reasoning_section_break agent_message user_message token_count task_started
    task_complete turn_aborted exec_command_begin exec_command_end exec_approval_request apply_patch_approval_request
    patch_apply_begin patch_apply_end mcp_tool_call_begin mcp_tool_call_end web_search_begin web_search_end
    view_image_tool_call item_started item_completed context_compacted entered_review_mode exited_review_mode plan_update
    stream_error error background_event UserMessage AgentMessage Reasoning CommandExecution FileChange McpToolCall
    CollabAgentToolCall WebSearch ImageView ContextCompaction EnteredReviewMode ExitedReviewMode Plan HookPrompt
    FunctionCallOutput TodoList SubAgentActivity DynamicToolCall Extension ImageGeneration collab_agent_spawn_begin
    collab_agent_spawn_end collab_agent_interaction_begin collab_agent_interaction_end collab_waiting_begin
    collab_waiting_end collab_close_begin collab_close_end collab_resume_begin collab_resume_end ghost_snapshot turn_diff
    request_user_input add delete update read-only workspace-write danger-full-access external-sandbox Text image
    local_image`),
  role: ens('user assistant developer system tool'),
  status: ens(`completed failed declined in_progress pending incomplete cancelled canceled interrupted success error aborted
    pending_init running shutdown not_found errored`),
  phase: ens('final_answer commentary'),
  originator: ens('codex-tui codex_cli_rs codex_exec codex_vscode codex_sdk_ts'),
  source: ens('cli exec vscode mcp agent user subagent unknown'),
  thread_source: ens('user subagent'),
  history_mode: ens('paginated full'),
  model_provider: ens('openai oss ollama lmstudio azure'),
  approval_policy: ens('untrusted on-failure on-request never'),
  summary: ens('auto concise detailed none'),
  effort: ens('minimal low medium high xhigh none'),
  decision: ens('approved approved_for_session denied abort'),
  kind: ens('add delete update'),
  agent_type: ens('default worker explorer'),
  agent_role: ens('default worker explorer'),
  name: OUTILS,
  tool: OUTILS,
}));
const IDS = ens(`id call_id turn_id thread_id session_id parent_thread_id sender_thread_id receiver_thread_id
  receiver_thread_ids new_thread_id agent_id forked_from_id`);
const NOMBRES = ens('exit_code depth');
const BOOLEENS = ens('success');
const TABLEAUX = ens('receiver_thread_ids'); // les seuls tableaux dont les éléments s'affichent
// Les noms de clés qui se notent (codex.ts, annexe 03) ; les autres, par leur longueur.
const CLES = ens(`timestamp ordinal type payload id session_id cwd originator cli_version source thread_source
  model_provider history_mode git commit_hash branch repository_url creator_user_id creator_account_id base_instructions
  text instructions history_base forked_from_id subagent thread_spawn parent_thread_id depth agent_role agent_type
  agent_nickname turn_id model approval_policy sandbox_policy summary effort role content phase encrypted_content name
  namespace arguments call_id output input status action query url pattern command thread_id item prompt
  sender_thread_id receiver_thread_ids receiver_thread_id new_thread_id agent_id nickname message ids timeout_ms cmd
  workdir sandbox_permissions justification aggregated_output exit_code duration duration_ms changes reason
  last_agent_message info total_token_usage last_token_usage model_context_window input_tokens cached_input_tokens
  output_tokens reasoning_output_tokens total_tokens rate_limits primary secondary used_percent window_minutes resets_at
  parsed_cmd command_actions path stdout stderr formatted_output server tool invocation result structured_content
  structuredContent Ok Err content_items success decision kind unified_diff move_path secs nanos plan explanation step
  user_instructions developer_instructions writable_roots network_access exclude_tmpdir_env_var exclude_slash_tmp mode
  collaboration_mode personality truncation_policy limit tokens image_url detail auto_approved process_id stdin chars
  yield_time_ms max_output_tokens tty login shell error code`);
// Sous ces clés, les arguments d'un appel : aucune valeur, seulement les noms de clés connus.
const ARGUMENTS = ens('arguments input invocation parsed_cmd command_actions action');
// Sous ces clés, une sortie d'outil ou des clés qui sont des données : ni valeur, ni nom de clé.
const DONNEES = ens('output result structured_content structuredContent changes aggregated_output formatted_output stdout stderr content_items');
// Le premier niveau du CODEX_HOME : les noms qui se notent.
const NOMS = ens(`auth.json config.toml history.jsonl sessions archived_sessions log version.json models_cache.json
  internal_storage.json shell_snapshots tmp AGENTS.md rules skills prompts plugins .personality_migration`);
const EXTENSIONS = ens('.jsonl .json .tmp .lock');

const dict = () => Object.create(null);
const compter = (d, cle) => {
  d[cle] = (d[cle] ?? 0) + 1;
};
const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = (texte) => {
  try {
    return JSON.parse(texte);
  } catch {
    return undefined;
  }
};
const sha = (texte) => createHash('sha256').update(texte).digest('hex');
// La longueur JSON d'une valeur, ou rien si elle est trop profonde pour JSON.stringify.
const taille = (v) => {
  try {
    return JSON.stringify(v ?? null).length;
  } catch {
    return '<trop profond>';
  }
};
// Un relevé qui tombe ne fait pas tomber le rapport : seul le code de l'erreur sort, jamais son message.
const sur = (f) => {
  try {
    return f();
  } catch (e) {
    return { erreur: e.code ?? e.name };
  }
};

// Le cadre d'une clé : '' (la forme de l'outil), 'arguments' ou 'donnees' (voir ARGUMENTS et DONNEES ; une clé hors de
// CLES est traitée comme des données).
const cadreDe = (cadre, cle) =>
  cadre === 'donnees' || DONNEES.has(cle) || !CLES.has(cle) ? 'donnees' : cadre === 'arguments' || ARGUMENTS.has(cle) ? 'arguments' : '';
const nomCle = (k, cadre = '') => (cadre !== 'donnees' && CLES.has(k) ? k : `<clé de ${k.length} caractères>`);
const extension = (n) => (EXTENSIONS.has(extname(n)) ? extname(n) : '');

// Un identifiant ne s'affiche jamais : un numéro, le même pour le même identifiant le temps du relevé, et sa forme.
const pseudos = new Map();
const pseudo = (v) => {
  if (!pseudos.has(v)) pseudos.set(v, pseudos.size + 1);
  return `<id n°${pseudos.get(v)}, ${UUID.test(v) ? 'uuid' : (PREFIXE.exec(v)?.[0] ?? 'autre')}>`;
};
// L'UUID d'un nom de rollout est celui du fil : il prend le même pseudonyme que `fil` et `parent`.
const nomDe = (n) =>
  NOMS.has(n) ? n : ROLLOUT.test(n) ? n.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i, (u) => pseudo(u)) : `<nom de ${n.length} caractères>${extension(n)}`;
const cheminNote = (rel) => rel.split('/').map(nomDe).join('/');

// La valeur d'une clé, si elle peut s'afficher ; sinon undefined.
function montrable(cle, v, cadre = '') {
  if (cadre !== '') return undefined;
  if (typeof v === 'boolean') return BOOLEENS.has(cle) ? v : undefined;
  if (typeof v === 'number') return NOMBRES.has(cle) && Number.isInteger(v) && Math.abs(v) < 1000 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  if (VALEURS.get(cle)?.has(v)) return v;
  return IDS.has(cle) && v !== '' ? pseudo(v) : undefined;
}
const masque = (cle, v) =>
  typeof v === 'string'
    ? (cle === 'name' || cle === 'tool') && v.startsWith('mcp') ? `<outil mcp de ${v.length} caractères>` : `<texte de ${v.length} caractères>`
    : v === undefined ? '(absent)' : `<${typeDe(v)}>`;
const ident = (cle, v) => montrable(cle, v) ?? masque(cle, v);

// --- La forme fusionnée de plusieurs valeurs : clés, types, longueurs, présence, valeurs de la liste fermée ---
const noeud = () => ({ vus: 0, types: dict(), valeurs: new Set(), cles: dict(), objets: 0, nbElements: 0, parType: dict() });
// Les types et outils hors des listes, comptés par étiquette masquée : remis à zéro par chaque relevé (voir releve).
let inconnues = dict();

function fusionner(n, v, cle, cadre, p = 0) {
  n.vus++;
  if (p > PROFONDEUR) return void compter(n.types, '<trop profond>');
  const t = typeDe(v);
  compter(n.types, t);
  if (t === 'string') {
    n.min = Math.min(n.min ?? Infinity, v.length);
    n.max = Math.max(n.max ?? 0, v.length);
  }
  const retenue = montrable(cle, v, cadre);
  if (retenue !== undefined) n.valeurs.add(retenue);
  else if (cadre === '' && t === 'string' && ['type', 'name', 'tool'].includes(cle) && !v.startsWith('mcp')) {
    compter(inconnues, `${cle} ${masque(cle, v)}`);
  }
  if (t === 'object') {
    n.objets++;
    // Deux clés masquées de même longueur dans un même objet restent distinctes (n°2…), comme dans champs.
    const pris = new Set();
    for (const [k, x] of Object.entries(v)) {
      let nom = nomCle(k, cadre);
      for (let i = 2; pris.has(nom); i++) nom = `${nomCle(k, cadre)} n°${i}`;
      pris.add(nom);
      fusionner((n.cles[nom] ??= noeud()), x, k, cadreDe(cadre, k), p + 1);
    }
  }
  if (t === 'array') {
    for (const x of v) {
      n.nbElements++;
      const typee = objet(x) && montrable('type', x.type, cadre) !== undefined;
      // Un élément de tableau ne garde sa clé (et sa valeur) que pour les tableaux de TABLEAUX.
      fusionner(typee ? (n.parType[x.type] ??= noeud()) : (n.elements ??= noeud()), x, TABLEAUX.has(cle) ? cle : '', cadre, p + 1);
    }
  }
}

function rendre(n, sur) {
  const o = { presente: `${n.vus}/${sur}`, types: n.types };
  if (n.min !== undefined) Object.assign(o, { longueur_min: n.min, longueur_max: n.max });
  if (n.valeurs.size > 0) {
    const l = [...n.valeurs].sort();
    o.valeurs = l.length > 20 ? [...l.slice(0, 20), '…'] : l;
  }
  const sous = (d, total) => Object.fromEntries(Object.entries(d).map(([k, c]) => [k, rendre(c, total)]));
  if (n.objets > 0) o.cles = sous(n.cles, n.objets);
  if (n.elements) o.elements = rendre(n.elements, n.nbElements);
  if (Object.keys(n.parType).length > 0) o.elements_par_type = sous(n.parType, n.nbElements);
  return o;
}

// Les champs d'un objet : pour chacun, son type et sa longueur, ou sa valeur si elle peut s'afficher.
function champs(o, cadre = '') {
  const d = dict();
  for (const [k, v] of Object.entries(o)) {
    const t = typeDe(v);
    const valeur = montrable(k, v, cadre);
    let nom = nomCle(k, cadre);
    for (let i = 2; nom in d; i++) nom = `${nomCle(k, cadre)} n°${i}`;
    d[nom] = {
      type: t,
      ...(t === 'string' || t === 'array' ? { longueur: v.length } : {}),
      ...(t === 'object' ? { nombre_de_cles: Object.keys(v).length } : {}),
      ...(valeur !== undefined ? { valeur } : {}),
    };
  }
  return d;
}

const formeContenu = (c) =>
  typeof c === 'string'
    ? { chaine: c.length }
    : Array.isArray(c)
      ? { tableau: c.map((x) => ({ type: ident('type', x?.type), longueur: taille(x) })) }
      : { type: typeDe(c) };

// --- Lecture ---
async function lire(fichier) {
  const brut = await readFile(fichier, 'utf8');
  const lignes = [];
  let illisibles = 0;
  let tete; // la première ligne non vide, null si elle est illisible
  for (const ligne of brut.split('\n')) {
    if (!ligne.trim()) continue;
    const v = json(ligne);
    tete ??= objet(v) ? v : null;
    if (objet(v)) lignes.push(v);
    else illisibles++;
  }
  return { lignes, illisibles, octets: (await stat(fichier)).size, tete };
}

// Les fichiers sous un dossier, sans suivre aucun lien : un lien ou un fichier spécial est seulement compté.
async function fichiersSous(racine, garde, rel = '') {
  const entrees = await readdir(join(racine, rel), { withFileTypes: true }).catch((e) => {
    if (e.code !== 'ENOENT') compter(garde.illisibles, e.code ?? e.name);
    return [];
  });
  const sortie = [];
  for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) sortie.push(...(await fichiersSous(racine, garde, chemin)));
    else if (e.isFile()) sortie.push(chemin);
    else garde.liens_ou_autres++;
  }
  return sortie;
}

// Le premier niveau du CODEX_HOME de l'essai : noms connus, sortes et tailles. Jamais un contenu.
async function premierNiveau(dossier) {
  const entrees = await readdir(dossier, { withFileTypes: true });
  return Promise.all(
    entrees
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (e) => ({
        nom: nomDe(e.name),
        sorte: e.isDirectory() ? 'dossier' : e.isFile() ? 'fichier' : 'autre',
        ...(e.isFile() ? { octets: await stat(join(dossier, e.name)).then((s) => s.size, (x) => `<${x.code ?? x.name}>`) } : {}),
      })),
  );
}

// --- Les relevés d'un rollout ---
// `response_item/function_call`, `event_msg/item_completed/CommandExecution`…
const etiquette = (l) =>
  ident('type', l.type) +
  (typeof l.payload?.type === 'string' ? `/${ident('type', l.payload.type)}` : '') +
  (typeof l.payload?.item?.type === 'string' ? `/${ident('type', l.payload.item.type)}` : '');

// La longueur de tout le texte d'une valeur, hors valeurs techniques et hors chiffre.
function longueurTexte(v, cle, p = 0) {
  if (p > PROFONDEUR) return 0;
  if (typeof v === 'string') return VALEURS.has(cle) || IDS.has(cle) || cle === 'encrypted_content' ? 0 : v.length;
  if (Array.isArray(v)) return v.reduce((s, x) => s + longueurTexte(x, cle, p + 1), 0);
  if (objet(v)) return Object.entries(v).reduce((s, [k, x]) => s + longueurTexte(x, k, p + 1), 0);
  return 0;
}
const chiffre = (v, p = 0) =>
  p <= PROFONDEUR &&
  (objet(v)
    ? Object.entries(v).some(([k, x]) => (k === 'encrypted_content' && typeof x === 'string' && x !== '') || chiffre(x, p + 1))
    : Array.isArray(v) && v.some((x) => chiffre(x, p + 1)));

const APPEL = /_call$/; // function_call, custom_tool_call, local_shell_call, web_search_call…
// Les éléments de tour qui ne sont pas des appels : leur `item.id` ne compte pas comme un appel.
const PAS_UN_APPEL = ens('UserMessage AgentMessage Reasoning Plan TodoList ContextCompaction EnteredReviewMode ExitedReviewMode HookPrompt');
const SORTIE = /_call_output$/;

// Un appel : son type, son outil (natif) et son statut ; ses arguments par leur seule forme, jamais une valeur.
function decrireAppel(p) {
  const d = { type: ident('type', p.type), name: ident('name', p.name), namespace: ident('namespace', p.namespace), status: ident('status', p.status) };
  for (const cle of ['arguments', 'input']) {
    if (typeof p[cle] !== 'string') continue;
    const v = json(p[cle]);
    d[cle] = objet(v) ? { json: champs(v, 'arguments') } : { chaine: p[cle].length };
  }
  if (objet(p.action)) d.action = champs(p.action, 'arguments');
  return d;
}

// Chaque identifiant d'appel (`call_id`, `item.id`), et où il apparaît : l'appel, sa sortie, ses éléments de tour et
// ses évènements. Dit les copies en double, le statut, le code de sortie, la forme d'un refus.
function appels(lignes) {
  const parId = new Map();
  for (const l of lignes) {
    const p = l.payload;
    if (!objet(p)) continue;
    const type = typeof p.type === 'string' ? p.type : '';
    const item = objet(p.item) && !PAS_UN_APPEL.has(p.item.type) ? p.item.id : undefined;
    const id = [p.call_id, item, APPEL.test(type) ? p.id : undefined].find((x) => typeof x === 'string' && x);
    if (id === undefined) continue;
    const a = parId.get(id) ?? { id: ident('id', id), vu_dans: dict() };
    parId.set(id, a);
    const e = etiquette(l);
    compter(a.vu_dans, e);
    if (l.type === 'response_item' && APPEL.test(type)) a.appel ??= decrireAppel(p);
    else if (l.type === 'response_item' && SORTIE.test(type)) a.sortie ??= formeContenu(p.output);
    else (a.details ??= dict())[e] = champs(objet(p.item) ? p.item : p);
  }
  return [...parId.values()];
}

function releve({ lignes, illisibles, octets }) {
  const r = {
    lignes: lignes.length,
    illisibles,
    octets,
    types_de_ligne: dict(),
    formes: dict(),
    raisonnement: dict(),
    horodatage: { avec_timestamp: 0, avec_ordinal: 0, ordinaux_croissants: true },
    // Un type ou un outil qu'aucune liste ne nomme : compté, pour ne jamais se lire comme une absence.
    formes_inconnues: (inconnues = dict()),
  };
  const noeuds = dict();
  let precedent = -Infinity;
  for (const l of lignes) {
    const e = etiquette(l);
    compter(r.types_de_ligne, e);
    fusionner((noeuds[e] ??= noeud()), l, '', '');
    if (typeof l.timestamp === 'string') r.horodatage.avec_timestamp++;
    if (typeof l.ordinal === 'number') {
      r.horodatage.avec_ordinal++;
      if (l.ordinal <= precedent) r.horodatage.ordinaux_croissants = false;
      precedent = l.ordinal;
    }
    if (!/reason/i.test(e)) continue;
    const s = (r.raisonnement[e] ??= { lignes: 0, avec_texte: 0, texte_longueur_max: 0, avec_chiffre: 0 });
    s.lignes++;
    const n = longueurTexte(l.payload, '');
    if (n > 0) s.avec_texte++;
    s.texte_longueur_max = Math.max(s.texte_longueur_max, n);
    if (chiffre(l.payload)) s.avec_chiffre++;
  }
  for (const [e, n] of Object.entries(noeuds)) r.formes[e] = rendre(n, n.vus);
  return { ...r, appels: appels(lignes) };
}

// --- Les sous-agents ---
// Le texte des messages d'un rôle (`response_item/message`), dans l'ordre. Ne sert qu'à des comparaisons.
const messages = (lignes, role) =>
  lignes.flatMap((l) =>
    l.type === 'response_item' && l.payload?.type === 'message' && l.payload.role === role && Array.isArray(l.payload.content)
      ? [l.payload.content.filter((x) => typeof x?.text === 'string').map((x) => x.text).join('\n').trim()]
      : [],
  );

// La première valeur texte d'une clé, cherchée en profondeur.
function premiere(v, cle, p = 0) {
  if ((!objet(v) && !Array.isArray(v)) || p > PROFONDEUR) return undefined;
  for (const [k, x] of Object.entries(v)) {
    if (k === cle && typeof x === 'string') return x;
    const t = premiere(x, cle, p + 1);
    if (t !== undefined) return t;
  }
  return undefined;
}

// Chaque chaîne d'une ligne, avec le chemin de ses clés ; une chaîne `arguments`, `input` ou `output` en JSON est ouverte.
function* chaines(v, chemin = '', cadre = '', p = 0) {
  if (p > PROFONDEUR) return;
  if (typeof v === 'string') {
    yield [chemin, v];
    const ouverte = /\.(arguments|input|output)$/.test(chemin) ? json(v) : undefined;
    if (ouverte !== null && typeof ouverte === 'object') yield* chaines(ouverte, `${chemin}{json}`, cadre, p + 1);
  } else if (Array.isArray(v)) {
    for (const x of v) yield* chaines(x, `${chemin}[]`, cadre, p + 1);
  } else if (objet(v)) {
    for (const [k, x] of Object.entries(v)) yield* chaines(x, `${chemin}.${nomCle(k, cadre)}`, cadreDe(cadre, k), p + 1);
  }
}

// Où une chaîne vérifie le test : l'étiquette de la ligne et le chemin des clés, comptés. Jamais la chaîne.
function endroits(lignes, test) {
  const d = dict();
  for (const l of lignes) for (const [chemin, s] of chaines(l)) if (test(s)) compter(d, `${etiquette(l)} ${chemin}`);
  return d;
}

// Où un texte de l'enfant se retrouve dans le parent : à l'identique (empreinte), ou contenu, tel quel ou échappé en JSON.
const COURT = 16;
function retrouver(lignes, texte) {
  if (texte.length < COURT) return { longueur: texte.length, trop_court: true };
  const echappe = JSON.stringify(texte).slice(1, -1);
  const empreinte = sha(texte);
  return {
    longueur: texte.length,
    identique: endroits(lignes, (s) => sha(s.trim()) === empreinte),
    contenu: endroits(lignes, (s) => s.trim() !== texte && (s.includes(texte) || s.includes(echappe))),
    contient: endroits(lignes, (s) => s.trim().length >= COURT && s.trim() !== texte && texte.includes(s.trim())),
  };
}

const estEnfant = (r) =>
  r.parent !== undefined || (objet(r.meta.source) && 'subagent' in r.meta.source) || r.meta.thread_source === 'subagent';

function lier(e, rollouts) {
  const p = rollouts.find((r) => r.fil === e.parent);
  const lien = { enfant: ident('id', e.fil), parent: ident('id', e.parent), parent_releve: Boolean(p) };
  if (!p) return lien;
  const rapport = messages(e.f.lignes, 'assistant').at(-1);
  return {
    ...lien,
    id_de_l_enfant_dans_le_parent: {
      identique: endroits(p.f.lignes, (s) => s === e.fil),
      cite: endroits(p.f.lignes, (s) => s !== e.fil && s.includes(e.fil)),
    },
    consignes: messages(e.f.lignes, 'user').map((t, i) => ({ rang: i + 1, ...retrouver(p.f.lignes, t) })),
    rapport: rapport === undefined ? null : retrouver(p.f.lignes, rapport),
    fin_de_l_enfant: e.f.lignes.slice(-3).map(etiquette),
  };
}

// --- Le rapport ---
function refuser(message) {
  console.error(message);
  process.exit(2);
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  if (!arg1 || !arg2) refuser("Usage : node codex-coulisses.mjs <CODEX_HOME de l'essai> <dossier d'essai>, chemins absolus");
  const home = resolve(arg1);
  const essai = resolve(arg2);
  const [homeReel, essaiReel] = await Promise.all([home, essai].map((x) => realpath(x).catch(() => x)));
  // Le jeton dans le nom même du dossier, pas dans un dossier parent.
  if (![home, homeReel, essai, essaiReel].every((x) => basename(x).includes(JETON))) {
    refuser(`Refusé : le nom du CODEX_HOME ou du dossier d'essai ne porte pas le jeton ${JETON}.`);
  }
  const sessions = join(home, 'sessions');
  const s = await lstat(sessions).catch(() => null);
  if (s !== null && !s.isDirectory()) refuser("Refusé : sessions n'est pas un vrai dossier (un lien ?). Ce script ne le suit pas.");
  // Un dossier de travail absolu, `.` et `..` résolus, et son chemin réel s'il existe : tous deux sous l'essai.
  const reel = (x) => {
    try {
      return realpathSync(x);
    } catch {
      return x;
    }
  };
  const sous = (c) => [essai, essaiReel].some((d) => c === d || c.startsWith(d + sep));
  const dans = (cwd) => typeof cwd === 'string' && isAbsolute(cwd) && sous(resolve(cwd)) && sous(reel(resolve(cwd)));
  const garde = {
    rollouts_releves: 0,
    rollouts_hors_garde: 0,
    rollouts_sans_en_tete_lisible: 0,
    illisibles: dict(),
    liens_ou_autres: 0,
    autres_fichiers_sous_sessions: dict(),
  };
  const rollouts = [];
  for (const rel of await fichiersSous(sessions, garde)) {
    if (!/(^|\/)rollout-[^/]*\.jsonl$/.test(rel)) {
      compter(garde.autres_fichiers_sous_sessions, extension(rel) || '<autre>');
      continue;
    }
    let f;
    try {
      f = await lire(join(sessions, rel));
    } catch (e) {
      compter(garde.illisibles, e.code ?? e.name);
      continue;
    }
    // La seconde garde : l'en-tête est la première ligne ; son dossier de travail, et celui de tout autre session_meta ou
    // turn_context, doivent être dans l'essai. Lus, jamais affichés.
    const meta = f.tete?.type === 'session_meta' ? f.tete.payload : undefined;
    if (!objet(meta) || typeof meta.cwd !== 'string') {
      garde.rollouts_sans_en_tete_lisible++;
      continue;
    }
    const ailleurs = (l) => (l.type === 'session_meta' || l.type === 'turn_context') && objet(l.payload) && 'cwd' in l.payload && !dans(l.payload.cwd);
    if (f.lignes.some(ailleurs)) {
      garde.rollouts_hors_garde++;
      continue;
    }
    garde.rollouts_releves++;
    rollouts.push({ rel, f, meta, fil: meta.id, parent: premiere(meta, 'parent_thread_id') });
  }
  const rapport = {
    outil: { node: process.version, date: new Date().toISOString() },
    garde,
    codex_home: await premierNiveau(home),
    rollouts: rollouts.map((r) => ({
      fichier: cheminNote(r.rel),
      fil: ident('id', r.fil),
      enfant: estEnfant(r),
      parent: ident('id', r.parent),
      longueurs_des_messages: {
        user: messages(r.f.lignes, 'user').map((t) => t.length),
        assistant: messages(r.f.lignes, 'assistant').map((t) => t.length),
      },
      ...sur(() => releve(r.f)),
    })),
    liens: rollouts.filter(estEnfant).map((e) => sur(() => lier(e, rollouts))),
  };
  console.log(JSON.stringify(rapport, null, 2));
}

main().catch((e) => {
  console.error(`Erreur : ${e.code ?? e.name}`); // jamais le message : il pourrait citer un bout de la session
  process.exit(1);
});
