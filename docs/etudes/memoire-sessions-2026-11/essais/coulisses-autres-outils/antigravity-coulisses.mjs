#!/usr/bin/env node
// Le témoin des coulisses d'Antigravity (essai de la PR 4 du lot 14), sur le modèle de claude-code-coulisses.mjs. Il
// relève la FORME des transcripts d'une session de test : sous quelle forme Antigravity écrit le raisonnement de
// l'agent, les appels d'outils et les échanges des sous-agents. Node seul, sans dépendance.
//
//   node antigravity-coulisses.mjs <dossier d'essai, chemin absolu> <dossier ~/.gemini, chemin absolu>
//
// Il écrit un rapport JSON indenté sur la sortie standard, et rien sur le disque. Il ne lit que les `.jsonl` (de vrais
// fichiers, jamais un lien, sous de vrais dossiers, jamais un lien) de `<~/.gemini>/{antigravity,antigravity-ide,
// antigravity-cli}/brain/<conversation>/.system_generated/logs/` ; des autres fichiers d'une conversation retenue,
// seulement les noms connus et les tailles.
//
// Règle n°1, la forme, jamais un texte. Une valeur ne s'affiche que si elle est dans la liste fermée de sa clé (VALEURS :
// types d'étapes, sources, statuts, outils natifs), ou un petit entier sous `exit_code`. Un identifiant ne s'affiche
// jamais : il devient un pseudonyme, le même pour le même identifiant le temps du relevé ; seul le nom du dossier d'une
// conversation (un UUID) s'affiche, pour le ménage. Toute autre valeur s'affiche comme son type et sa longueur. Un nom de
// clé ne se note que s'il est dans la liste fermée CLES, sinon sa longueur. Sous les `args` d'un appel, aucune valeur,
// nombres compris ; sous une sortie d'outil ou une clé hors de CLES, ni valeur ni nom de clé. Une étape se repère par son
// rang dans le fichier. Un nom de fichier ne se note que s'il est connu ; une balise d'une étape USER_INPUT se nomme si
// elle est de la liste BALISES, sinon elle est comptée. Au-delà de PROFONDEUR niveaux, rien n'est lu. Une forme
// inattendue (tool_calls hors tableau, entrée hors texte, clé d'étape inconnue, rappel de sous-agent hors USER_INPUT)
// est comptée, jamais sautée en silence.
//
// Règle n°2, une garde contre les vraies sessions. Le chemin d'un transcript ne dit pas son dossier de travail : la
// garde est donc ce dossier, lu dans le transcript comme le fait Leon (antigravity.ts : le premier `Cwd` d'un appel,
// sinon le premier chemin de `<user_information>`), lu dans chaque transcript de la conversation : il faut qu'au moins un
// le donne, et que tous ceux qui le donnent soient le dossier d'essai, ou sous lui. Le nom de ce dossier doit porter le
// jeton `leon-essai-coulisses` (sinon code 2). Avant toute lecture, une conversation dont aucun transcript n'a changé
// depuis la création du dossier d'essai n'est pas ouverte, seulement comptée : seules celles touchées pendant l'essai
// sont lues, en mémoire. Une conversation lue qui ne passe pas la garde, ou illisible, est seulement comptée (et à part,
// celles dont aucun transcript ne donne le dossier). Un dossier `brain` ou `logs` illisible est compté sous
// `dossiers_illisibles`, et `brains_lus` dit combien de dossiers `brain` ont été lus : à 0, la racine est fausse.
//
// La seconde reconnaissance, par les messages exacts de l'essai (le protocole les fait coller), pour une conversation
// touchée pendant l'essai que la garde par le dossier ne retient pas. Une conversation qui n'est pas un sous-agent est
// retenue (`messages_de_l_essai`) si sa PREMIÈRE entrée de l'utilisateur (la première étape USER_INPUT, sa balise
// USER_REQUEST, sinon l'entrée sans les blocs user_information, ADDITIONAL_METADATA et subagent_reminder ; jamais une
// sortie d'outil, un texte de l'agent ou un historique) commence par la première phrase de PHRASES_DE_L_ESSAI et contient
// la seconde. Les phrases ne servent qu'à cette recherche, jamais affichées. `conversations_retenues_par_leurs_messages`
// compte ces conversations et les sous-agents retenus par leur consigne.
//
// Un sous-agent (sa propre conversation, avec son `<subagent_reminder>`) est retenu (`sous_agent_de_l_essai`) seulement
// s'il n'a pas de dossier de travail hors de l'essai, toujours d'une conversation mère retenue par son dossier ou ses
// messages, jamais de proche en proche, de deux façons : par le lien parent-enfant (son UUID dans une étape
// INVOKE_SUBAGENT ou BROWSER_SUBAGENT, ou dans un appel invoke_subagent ou browser_subagent de la mère, ou l'UUID de la
// mère dans son `<subagent_reminder>`) ; ou si sa consigne (sa première entrée) contient l'une des deux phrases
// CONSIGNES_DE_L_ESSAI et qu'aucune conversation non retenue n'a ce lien avec lui. Un sous-agent à la consigne de
// l'essai qui n'est pas retenu est compté (`sous_agents_a_consigne_de_l_essai_non_retenus`), pour le ménage.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

const JETON = 'leon-essai-coulisses';
// Les phrases exactes du protocole (protocole.md, messages 1 et consignes des sous-agents). Jamais affichées.
// En NFC, pour ne pas dépendre de l'encodage de ce fichier.
const CONSIGNES_DE_L_ESSAI = [
  "Lis seulement le fichier a.txt de ce dossier, puis réponds en une phrase ce qu'il dit.",
  'Va chercher la page web https://example.com et donne son titre.',
].map((p) => p.normalize('NFC'));
const PHRASES_DE_L_ESSAI = ["C'est un essai. Ne modifie aucun fichier.", CONSIGNES_DE_L_ESSAI[0]];
const VARIANTES = ['antigravity', 'antigravity-ide', 'antigravity-cli'];
const PROFONDEUR = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ens = (mots) => new Set(mots.split(/\s+/).filter(Boolean));
const ETAPES = ens(`USER_INPUT PLANNER_RESPONSE CONVERSATION_HISTORY KNOWLEDGE_ARTIFACTS CHECKPOINT SYSTEM_MESSAGE
  EPHEMERAL_MESSAGE GENERIC RUN_COMMAND VIEW_FILE CODE_ACTION GREP_SEARCH LIST_DIRECTORY INVOKE_SUBAGENT READ_URL_CONTENT
  SEARCH_WEB CALL_MCP_TOOL COMMAND_STATUS SEND_COMMAND_INPUT WRITE_TO_FILE REPLACE_FILE_CONTENT FIND MANAGE_TASK
  ERROR_MESSAGE BROWSER_SUBAGENT`);
// Les valeurs qui s'affichent, par clé (antigravity.ts, annexe 05). Toute autre valeur se masque.
const VALEURS = new Map(Object.entries({
  type: ETAPES,
  step_type: ETAPES,
  source: ens('USER_EXPLICIT USER_IMPLICIT MODEL SYSTEM'),
  status: ens('DONE CANCELED CANCELLED ERROR RUNNING PENDING WAITING'),
  name: ens(`run_command view_file write_to_file replace_file_content multi_replace_file_content grep_search list_dir
    find_by_name manage_task schedule invoke_subagent read_url_content search_web view_code_item command_status
    send_command_input browser_subagent codebase_search`),
}));
const IDS = ens('id tool_call_id conversation_id conversationId');
const NOMBRES = ens('exit_code');
const BOOLEENS = ens('');
// Les noms de clés qui se notent (antigravity.ts, annexe 05, arguments des outils natifs) ; les autres, par leur longueur.
const CLES = ens(`step_index source type status created_at content thinking thought tool_calls exit_code name args id tool_call_id
  step_type model text truncated_fields Cwd CommandLine SafeToAutoRun WaitMsBeforeAsync AbsolutePath TargetFile Prompt
  TaskName Url Query SearchPath DirectoryPath StartLine EndLine CodeContent Instruction Description Overwrite
  ReplacementChunks TargetContent ReplacementContent AllowMultiple IsArtifact ArtifactMetadata Summary Includes
  MatchPerLine CaseInsensitive IsRegex Pattern CommandId Input`);
// Sous ces clés, les arguments d'un appel : aucune valeur, seulement les noms de clés connus.
const ARGUMENTS = ens('args');
// Sous ces clés, une sortie d'outil : ni valeur, ni nom de clé.
const DONNEES = ens('result output');
// Les balises d'une étape USER_INPUT qui se nomment (antigravity.ts) ; les autres sont seulement comptées.
const BALISES = new Set(['USER_REQUEST', 'user_information', 'ADDITIONAL_METADATA', 'subagent_reminder']);
const RAISONNEMENT = /think|thought|reason/i;
// Les étapes du dialogue ; toutes les autres sont des résultats d'outils (RUN_COMMAND, VIEW_FILE, INVOKE_SUBAGENT…).
const DIALOGUE = new Set([
  'USER_INPUT', 'PLANNER_RESPONSE', 'CONVERSATION_HISTORY', 'CHECKPOINT', 'SYSTEM_MESSAGE', 'EPHEMERAL_MESSAGE',
  'KNOWLEDGE_ARTIFACTS',
]);
// Les noms de fichiers d'une conversation qui se notent ; les autres, par leur longueur et une extension connue.
const NOMS = ens(`task.md implementation_plan.md walkthrough.md task.md.resolved implementation_plan.md.resolved
  walkthrough.md.resolved transcript.jsonl transcript_full.jsonl .system_generated logs`);
const EXTENSIONS = ens('.md .png .webp .json .jsonl .txt');

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
const taille = (v) => {
  try {
    return JSON.stringify(v ?? '').length;
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
const nomDe = (n) => (NOMS.has(n) || UUID.test(n) ? n : `<nom de ${n.length} caractères>${extension(n)}`);
const cheminNote = (rel) => rel.split('/').map(nomDe).join('/');

// Un identifiant ne s'affiche jamais : un numéro, le même pour le même identifiant le temps du relevé, et sa forme.
const pseudos = new Map();
const pseudo = (v) => {
  if (!pseudos.has(v)) pseudos.set(v, pseudos.size + 1);
  return `<id n°${pseudos.get(v)}, ${UUID.test(v) ? 'uuid' : 'autre'}>`;
};

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
    ? cle === 'name' && v.startsWith('mcp') ? `<outil mcp de ${v.length} caractères>` : `<texte de ${v.length} caractères>`
    : v === undefined ? '(absent)' : `<${typeDe(v)}>`;
const ident = (cle, v) => montrable(cle, v) ?? masque(cle, v);

// --- La forme fusionnée de plusieurs valeurs : clés, types, longueurs, présence, valeurs de la liste fermée ---
const noeud = () => ({ vus: 0, types: dict(), valeurs: new Set(), cles: dict(), objets: 0, nbElements: 0, parType: dict() });

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
      fusionner(typee ? (n.parType[x.type] ??= noeud()) : (n.elements ??= noeud()), x, '', cadre, p + 1);
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

// --- Lecture ---
async function lire(fichier) {
  const brut = await readFile(fichier, 'utf8');
  const etapes = [];
  let illisibles = 0;
  for (const ligne of brut.split('\n')) {
    if (!ligne.trim()) continue;
    const v = json(ligne);
    if (objet(v)) etapes.push(v);
    else illisibles++;
  }
  return { etapes, illisibles, octets: (await stat(fichier)).size };
}

async function fichiersSous(racine, rel = '') {
  const entrees = await readdir(join(racine, rel), { withFileTypes: true }).catch(() => []);
  const sortie = [];
  for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) sortie.push(...(await fichiersSous(racine, chemin)));
    else if (e.isFile()) sortie.push({ chemin: cheminNote(chemin), octets: await stat(join(racine, chemin)).then((s) => s.size, (x) => `<${x.code ?? x.name}>`) });
    else sortie.push({ chemin: cheminNote(chemin), autre: 'lien ou fichier spécial, non suivi' });
  }
  return sortie;
}

// --- Les relevés d'un transcript ---
// Le texte d'une entrée : une chaîne, ou les parties texte d'un tableau. Ne sert qu'à des recherches.
const texteEntree = (c) =>
  typeof c === 'string'
    ? c
    : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : typeof x?.text === 'string' ? x.text : '')).join('\n') : '';
// Les appels d'une étape : `tool_calls` en tableau (ou un seul appel en objet), `{ name, args }`, `args` en objet ou en
// chaîne JSON (antigravity.ts).
const appelsDe = (e) =>
  (Array.isArray(e.tool_calls) ? e.tool_calls : objet(e.tool_calls) ? [e.tool_calls] : []).filter(objet).map((a) => ({
    brut: a,
    args: typeof a.args === 'string' ? json(a.args) : a.args,
  }));

const balise = (texte, nom) => {
  const debut = texte.indexOf(`<${nom}>`);
  const fin = debut === -1 ? -1 : texte.indexOf(`</${nom}>`, debut);
  return fin === -1 ? null : texte.slice(debut + nom.length + 2, fin);
};

// Le dossier de travail d'une conversation, comme Leon le lit (antigravity.ts, workingDirectory).
function dossierDeTravail(etapes) {
  for (const e of etapes) {
    for (const { args } of appelsDe(e)) {
      if (typeof args?.Cwd === 'string' && args.Cwd.startsWith('/')) return args.Cwd;
    }
    const info = balise(texteEntree(e.content), 'user_information');
    const chemin = info
      ?.split('\n')
      .map((x) => x.split(' -> ')[0]?.trim() ?? '')
      .find((x) => x.startsWith('/'));
    if (chemin) return chemin;
  }
  return null;
}

function releve({ etapes, illisibles, octets }) {
  const r = {
    etapes: etapes.length,
    illisibles,
    octets,
    types: dict(),
    sources_par_type: dict(),
    formes: dict(),
    raisonnement: dict(),
    balises_des_entrees: dict(),
    horodatage: { avec_created_at: 0, avec_step_index: 0, step_index_croissant: true },
    // Ce que le relevé des appels ne sait pas lire : compté, jamais sauté en silence.
    formes_inattendues: {
      tool_calls_hors_tableau: 0,
      entree_hors_texte: 0,
      appel_sans_name_ou_args: 0,
      appels_sous_une_autre_cle: 0,
      raisonnement_sous_une_autre_cle: 0,
      autres_cles_d_etape: 0,
      rappel_de_sous_agent_hors_USER_INPUT: 0,
    },
    appels: [],
    resultats: [],
  };
  const noeuds = dict();
  let precedent = -Infinity;
  etapes.forEach((e, i) => {
    const t = ident('type', e.type);
    compter(r.types, t);
    compter(r.sources_par_type, `${t}/${ident('source', e.source)}`);
    fusionner((noeuds[t] ??= noeud()), e, '', '');
    if (typeof e.created_at === 'string') r.horodatage.avec_created_at++;
    if (typeof e.step_index === 'number') {
      r.horodatage.avec_step_index++;
      if (e.step_index <= precedent) r.horodatage.step_index_croissant = false;
      precedent = e.step_index;
    }
    if (e.tool_calls !== undefined && !Array.isArray(e.tool_calls)) r.formes_inattendues.tool_calls_hors_tableau++;
    if (e.type === 'USER_INPUT' && typeof e.content !== 'string') r.formes_inattendues.entree_hors_texte++;
    if (e.type !== 'USER_INPUT' && texteEntree(e.content).includes('<subagent_reminder>')) r.formes_inattendues.rappel_de_sous_agent_hors_USER_INPUT++;
    // Une clé d'étape hors de CLES : un appel ou un raisonnement que le relevé ne lit pas, ou une autre forme.
    for (const k of Object.keys(e)) {
      if (CLES.has(k)) continue;
      r.formes_inattendues[/tool|call|function/i.test(k) ? 'appels_sous_une_autre_cle' : RAISONNEMENT.test(k) ? 'raisonnement_sous_une_autre_cle' : 'autres_cles_d_etape']++;
    }
    for (const [k, v] of Object.entries(e)) {
      if (!RAISONNEMENT.test(k)) continue;
      const s = (r.raisonnement[`${t}.${nomCle(k)}`] ??= { etapes: 0, avec_texte: 0, texte_longueur_max: 0 });
      s.etapes++;
      const n = typeof v === 'string' ? v.length : taille(v) - 2;
      if (n > 0) s.avec_texte++;
      s.texte_longueur_max = Math.max(s.texte_longueur_max, Number.isFinite(n) ? n : 0);
    }
    if (e.type === 'USER_INPUT') {
      for (const m of texteEntree(e.content).matchAll(/<([A-Za-z][\w:.-]{0,79})(?=[\s>/]|$)/g)) {
        compter(r.balises_des_entrees, BALISES.has(m[1]) ? m[1] : '(autre balise)');
      }
    }
    appelsDe(e).forEach(({ brut, args }, rang) => {
      if (typeof brut.name !== 'string' || brut.args === undefined) r.formes_inattendues.appel_sans_name_ou_args++;
      r.appels.push({
        etape: i,
        rang,
        name: ident('name', brut.name),
        cles_de_l_appel: Object.keys(brut).map((k) => nomCle(k)),
        args: objet(args) ? champs(args, 'arguments') : { type: typeDe(brut.args), json_illisible: typeof brut.args === 'string' },
      });
    });
    if (!DIALOGUE.has(e.type)) {
      r.resultats.push({
        etape: i,
        type: t,
        status: ident('status', e.status),
        exit_code: ident('exit_code', e.exit_code),
        contenu: typeof e.content === 'string' ? { longueur: e.content.length } : { type: typeDe(e.content) },
      });
    }
  });
  for (const [t, n] of Object.entries(noeuds)) r.formes[t] = rendre(n, n.vus);
  return r;
}

// --- Les liens entre un sous-agent et sa conversation mère ---
function* chaines(v, chemin = '', cadre = '', p = 0) {
  if (p > PROFONDEUR) return;
  if (typeof v === 'string') {
    yield [chemin, v];
    const ouverte = chemin.endsWith('.args') ? json(v) : undefined;
    if (ouverte !== null && typeof ouverte === 'object') yield* chaines(ouverte, `${chemin}{json}`, cadre, p + 1);
  } else if (Array.isArray(v)) {
    for (const x of v) yield* chaines(x, `${chemin}[]`, cadre, p + 1);
  } else if (objet(v)) {
    for (const [k, x] of Object.entries(v)) yield* chaines(x, `${chemin}.${nomCle(k, cadre)}`, cadreDe(cadre, k), p + 1);
  }
}

function endroits(etapes, test) {
  const d = dict();
  for (const e of etapes) for (const [chemin, s] of chaines(e)) if (test(s)) compter(d, `${ident('type', e.type)} ${chemin}`);
  return d;
}

const COURT = 16;
function retrouver(etapes, texte) {
  if (texte.length < COURT) return { longueur: texte.length, trop_court: true };
  const echappe = JSON.stringify(texte).slice(1, -1);
  const empreinte = sha(texte);
  return {
    longueur: texte.length,
    identique: endroits(etapes, (s) => sha(s.trim()) === empreinte),
    contenu: endroits(etapes, (s) => s.trim() !== texte && (s.includes(texte) || s.includes(echappe))),
    contient: endroits(etapes, (s) => s.trim().length >= COURT && s.trim() !== texte && texte.includes(s.trim())),
  };
}

// Le transcript de référence : transcript_full, sinon transcript, en sautant un fichier vide ou sans étape lisible.
const principal = (c) => {
  const lus = c.transcripts.filter((t) => t.etapes.length > 0);
  return lus.find((t) => t.nom === 'transcript_full.jsonl') ?? lus.find((t) => t.nom === 'transcript.jsonl') ?? lus[0] ?? c.transcripts[0];
};
// Le dossier de travail donné par chaque transcript qui en donne un.
const dossiers = (c) => c.transcripts.map((t) => dossierDeTravail(t.etapes)).filter((d) => d !== null);
// true, false, ou 'inconnu' quand une entrée a une forme que le script ne sait pas lire, ou qu'un rappel de sous-agent
// apparaît hors d'une étape USER_INPUT.
function estSousAgent(c) {
  const etapes = principal(c).etapes;
  const entrees = etapes.filter((e) => e.type === 'USER_INPUT');
  if (entrees.some((e) => texteEntree(e.content).includes('<subagent_reminder>'))) return true;
  const ailleurs = etapes.some((e) => e.type !== 'USER_INPUT' && texteEntree(e.content).includes('<subagent_reminder>'));
  return ailleurs || entrees.some((e) => typeof e.content !== 'string' && !Array.isArray(e.content)) ? 'inconnu' : false;
}
// Le parent lance l'enfant : l'UUID de l'enfant dans une étape INVOKE_SUBAGENT ou BROWSER_SUBAGENT, ou dans les args
// d'un invoke_subagent ou browser_subagent.
const ETAPES_DE_LANCEMENT = new Set(['INVOKE_SUBAGENT', 'BROWSER_SUBAGENT']);
const APPELS_DE_LANCEMENT = new Set(['invoke_subagent', 'browser_subagent']);
const lance = (p, c) =>
  c.id.length >= 8 &&
  principal(p).etapes.some(
    (e) =>
      (ETAPES_DE_LANCEMENT.has(e.type) && texteEntree(e.content).includes(c.id)) ||
      appelsDe(e).some((a) => APPELS_DE_LANCEMENT.has(a.brut.name) && [...chaines(a.args)].some(([, s]) => s.includes(c.id))),
  );
// L'enfant nomme son parent : l'UUID du parent dans son `<subagent_reminder>`.
const rappelle = (c, p) =>
  p.id.length >= 8 &&
  principal(c).etapes.some((e) => e.type === 'USER_INPUT' && (balise(texteEntree(e.content), 'subagent_reminder') ?? '').includes(p.id));
const parentDEnfant = (p, c) => p !== c && (lance(p, c) || rappelle(c, p));
// Le texte des entrées de l'utilisateur (étapes USER_INPUT), dans l'ordre : la balise USER_REQUEST, sinon l'entrée sans
// les blocs qu'Antigravity ajoute (comme userText dans antigravity.ts ; un bloc non fermé court jusqu'à la fin). NFC,
// apostrophes typographiques et blancs ramenés à une forme, pour la recherche seulement.
const sansBlocs = (t) => t.replace(/<(user_information|ADDITIONAL_METADATA|subagent_reminder)>[\s\S]*?(?:<\/\1>|$)/g, '');
const entrees = (c) =>
  principal(c)
    .etapes.filter((e) => e.type === 'USER_INPUT')
    .map((e) => texteEntree(e.content))
    .map((t) => (balise(t, 'USER_REQUEST') ?? sansBlocs(t)).normalize('NFC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim());

function lier(p, e) {
  const etapesP = principal(p).etapes;
  const etapesE = principal(e).etapes;
  const consignes = etapesE
    .filter((x) => x.type === 'USER_INPUT')
    .map((x) => texteEntree(x.content))
    .map((x) => (balise(x, 'USER_REQUEST') ?? x).trim());
  const rapport = etapesE
    .filter((x) => x.type === 'PLANNER_RESPONSE' && typeof x.content === 'string' && x.content.trim())
    .at(-1)
    ?.content.trim();
  return {
    parent: nomDe(p.id),
    enfant: nomDe(e.id),
    id_de_l_enfant_dans_le_parent: endroits(etapesP, (s) => s.includes(e.id)),
    id_du_parent_dans_l_enfant: endroits(etapesE, (s) => s.includes(p.id)),
    consignes: consignes.map((t, i) => ({ rang: i + 1, ...retrouver(etapesP, t) })),
    rapport: rapport === undefined ? null : retrouver(etapesP, rapport),
    fin_de_l_enfant: etapesE.slice(-2).map((x) => ({ type: ident('type', x.type), status: ident('status', x.status) })),
  };
}

// --- Le rapport ---
function refuser(message) {
  console.error(message);
  process.exit(2);
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  if (!arg1 || !arg2) {
    refuser("Usage : node antigravity-coulisses.mjs <dossier d'essai, chemin absolu> <dossier ~/.gemini, chemin absolu>");
  }
  const donne = resolve(arg1);
  const essai = await realpath(donne).catch(() => null);
  const info = essai === null ? null : await stat(essai);
  // Le jeton dans le nom même du dossier d'essai, pas dans un dossier parent.
  if (!basename(donne).includes(JETON) || essai === null || !basename(essai).includes(JETON) || !info.isDirectory()) {
    refuser(`Refusé : le dossier d'essai n'existe pas ou son nom ne porte pas le jeton ${JETON}.`);
  }
  const depuis = info.birthtimeMs || info.ctimeMs;
  const dans = (chemin) => [donne, essai].some((d) => resolve(chemin) === d || resolve(chemin).startsWith(d + sep));
  const gemini = resolve(arg2);
  const garde = {
    conversations_non_ouvertes: 0,
    conversations_hors_garde: 0,
    conversations_au_dossier_inconnu: 0,
    conversations_illisibles: dict(),
    jsonl_qui_ne_sont_pas_des_fichiers: 0,
    dossiers_en_lien: 0,
    // Un dossier brain ou logs qu'on n'a pas pu lire (hors absence) : un ménage n'est pas prouvé tant qu'il en reste.
    dossiers_illisibles: dict(),
    // Les dossiers brain lus : à 0, la racine ~/.gemini donnée est fausse, et les 0 ci-dessus ne prouvent rien.
    brains_lus: 0,
    // Les conversations retenues par les messages de l'essai, sous-agents par leur consigne compris.
    conversations_retenues_par_leurs_messages: 0,
    // Les sous-agents dont la consigne reprend celle de l'essai mais qui ne sont pas retenus (sans mère retenue, dossier
    // hors de l'essai, ou lancés par une autre conversation) : au ménage, il en reste un de l'essai, ou d'une autre.
    sous_agents_a_consigne_de_l_essai_non_retenus: 0,
    conversations_relevees: 0,
  };
  // La liste d'un dossier ; absent, une liste vide ; illisible, compté, et null.
  const lister = (dossier, options) =>
    readdir(dossier, options).catch((e) => {
      if (e.code === 'ENOENT') return [];
      compter(garde.dossiers_illisibles, e.code ?? e.name);
      return null;
    });
  // Un chemin qui existe sans être un vrai dossier (un lien, un fichier) : jamais suivi, seulement compté.
  const enLien = async (...chemins) => {
    for (const c of chemins) {
      const s = await lstat(c).catch(() => null);
      if (s !== null && !s.isDirectory()) return true;
    }
    return false;
  };
  const candidates = [];
  for (const variante of VARIANTES) {
    const brain = join(gemini, variante, 'brain');
    if (await enLien(join(gemini, variante), brain)) {
      garde.dossiers_en_lien++;
      continue;
    }
    const conversationsDuBrain = await lister(brain, { withFileTypes: true });
    if (conversationsDuBrain === null) continue;
    if ((await lstat(brain).catch(() => null)) !== null) garde.brains_lus++;
    for (const d of conversationsDuBrain) {
      if (!d.isDirectory()) continue;
      const logs = join(brain, d.name, '.system_generated', 'logs');
      if (await enLien(join(brain, d.name, '.system_generated'), logs)) {
        garde.dossiers_en_lien++;
        continue;
      }
      const entrees = await lister(logs);
      if (entrees === null) continue;
      const noms = entrees.filter((n) => n.endsWith('.jsonl')).sort();
      // Un `.jsonl` qui n'est pas un vrai fichier (lien, dossier) est compté, jamais ouvert.
      const fichiers = [];
      for (const nom of noms) {
        const s = await lstat(join(logs, nom)).catch(() => null);
        if (s?.isFile()) fichiers.push({ nom, date: s.mtimeMs });
        else garde.jsonl_qui_ne_sont_pas_des_fichiers++;
      }
      // Avant toute lecture : une conversation qu'aucun transcript n'a touchée depuis la création du dossier d'essai.
      if (!fichiers.some((f) => f.date >= depuis)) {
        garde.conversations_non_ouvertes++;
        continue;
      }
      try {
        const transcripts = [];
        for (const { nom } of fichiers) transcripts.push({ nom, ...(await lire(join(logs, nom))) });
        candidates.push({ id: d.name, variante, dossier: join(brain, d.name), transcripts });
      } catch (e) {
        compter(garde.conversations_illisibles, e.code ?? e.name);
      }
    }
  }
  const retenues = new Map();
  const parDossier = candidates.filter((c) => dossiers(c).length > 0 && dossiers(c).every(dans));
  for (const c of parDossier) retenues.set(c.id, 'dossier_de_travail');
  // La seconde reconnaissance, hors sous-agent : la première entrée de l'utilisateur commence par la première phrase de
  // l'essai et contient la seconde (le protocole fait coller le message 1 dans une nouvelle conversation).
  const parMessages = candidates.filter((c) => {
    const premiere = entrees(c)[0] ?? '';
    return !retenues.has(c.id) && estSousAgent(c) !== true && premiere.startsWith(PHRASES_DE_L_ESSAI[0]) && premiere.includes(PHRASES_DE_L_ESSAI[1]);
  });
  for (const c of parMessages) retenues.set(c.id, 'messages_de_l_essai');
  const meres = [...parDossier, ...parMessages];
  // Un sous-agent, toujours d'une mère retenue, sans proche en proche, et sans dossier de travail hors de l'essai : par
  // le lien parent-enfant, ou par une phrase de consigne de l'essai dans sa première entrée si aucune conversation non
  // retenue ne le lance ni n'est nommée dans son rappel.
  let parConsigne = 0;
  for (const c of candidates) {
    if (retenues.has(c.id) || estSousAgent(c) !== true) continue;
    const consigne = CONSIGNES_DE_L_ESSAI.some((p) => (entrees(c)[0] ?? '').includes(p));
    const possible = meres.length > 0 && dossiers(c).every(dans);
    const lie = possible && meres.some((p) => parentDEnfant(p, c));
    const parLaConsigne = possible && consigne && !candidates.some((p) => !retenues.has(p.id) && parentDEnfant(p, c));
    if (lie || parLaConsigne) retenues.set(c.id, 'sous_agent_de_l_essai');
    else if (consigne) garde.sous_agents_a_consigne_de_l_essai_non_retenus++;
    if (!lie && parLaConsigne) parConsigne++;
  }
  garde.conversations_retenues_par_leurs_messages = parMessages.length + parConsigne;
  const lues = candidates.filter((c) => retenues.has(c.id));
  garde.conversations_relevees = lues.length;
  garde.conversations_hors_garde = candidates.length - lues.length;
  // Pour le ménage : les conversations touchées pendant l'essai dont aucun transcript ne dit le dossier.
  garde.conversations_au_dossier_inconnu = candidates.filter((c) => !retenues.has(c.id) && dossiers(c).length === 0).length;
  const conversations = [];
  for (const c of lues) {
    conversations.push({
      conversation: nomDe(c.id), // le nom du dossier de la conversation (un UUID), pour le ménage
      variante: c.variante,
      retenue_par: retenues.get(c.id),
      sous_agent: estSousAgent(c),
      dossier: await fichiersSous(c.dossier),
      transcripts: c.transcripts.map((t) => ({ fichier: nomDe(t.nom), ...sur(() => releve(t)) })),
    });
  }
  const liens = [];
  for (const e of lues.filter((x) => estSousAgent(x) !== false)) {
    for (const p of meres) if (parentDEnfant(p, e)) liens.push(sur(() => lier(p, e)));
  }
  const rapport = { outil: { node: process.version, date: new Date().toISOString() }, garde, conversations, liens };
  console.log(JSON.stringify(rapport, null, 2));
}

main().catch((e) => {
  console.error(`Erreur : ${e.code ?? e.name}`); // jamais le message : il pourrait citer un bout de la session
  process.exit(1);
});
