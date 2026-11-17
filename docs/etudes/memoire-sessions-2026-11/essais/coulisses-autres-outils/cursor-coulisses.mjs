#!/usr/bin/env node
// Le témoin des coulisses de Cursor (essai de la PR 4 du lot 14), sur le modèle de claude-code-coulisses.mjs. Il relève
// la FORME des transcripts d'une session de test : sous quelle forme Cursor écrit le raisonnement de l'agent, les
// appels d'outils et les échanges des sous-agents. Node seul, sans dépendance.
//
//   node cursor-coulisses.mjs <dossier de projet de Cursor de l'essai : ~/.cursor/projects/<slug>, chemin absolu>
//
// Il écrit un rapport JSON indenté sur la sortie standard, et rien sur le disque. Dans ce dossier, il n'ouvre que les
// `.jsonl` de `agent-transcripts/` (et les `.json` sous `agent-transcripts/<conversation>/`) ; les autres fichiers de
// `agent-transcripts/` sont comptés par extension, et hors de `agent-transcripts/` (terminaux, outils MCP…), seul le
// premier niveau est compté.
//
// Règle n°1, la forme, jamais un texte. Une valeur ne s'affiche que si elle est dans la liste fermée de sa clé (VALEURS :
// types de blocs, rôles, statuts, outils natifs de Cursor). Un identifiant (sous une clé d'identifiant) ne s'affiche
// jamais : il devient un pseudonyme, le même pour le même identifiant le temps du relevé, et sa seule forme (uuid,
// toolu_…). Toute autre valeur s'affiche comme son type et sa longueur. Un nom de clé ne se note que s'il est dans la
// liste fermée CLES, sinon sa longueur. Sous les arguments d'un appel, aucune valeur ; sous une sortie d'outil (tout un
// bloc `tool_result` hors `type`, `tool_use_id` et `is_error`) ou une clé hors de CLES, ni valeur ni nom de clé. Un nom de
// fichier, et donc une conversation, ne se note que s'il est connu ou a la forme d'un UUID ; une balise d'un message
// `user` ou `assistant` se nomme si elle est de la liste BALISES, sinon elle est seulement comptée. Au-delà de
// PROFONDEUR niveaux, rien n'est lu. Un fichier illisible est noté avec le code de l'erreur, et le relevé continue ; un
// dossier de projet illisible ou absent est refusé (code 2).
//
// Règle n°2, une garde contre les vraies sessions : le script refuse de tourner (code 2) si le NOM du dossier donné, ou
// de son chemin réel, ne porte pas le jeton `leon-essai-coulisses` (un dossier parent qui le porte ne suffit pas).
// Cursor nomme le dossier de projet d'après le dossier de travail (`/Users/x/leon-essai-coulisses-cursor` donne
// `Users-x-leon-essai-coulisses-cursor`) : un dossier d'essai qui porte le jeton le lui donne, une vraie session de
// travail ne l'a pas. Il ne suit aucun lien.
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const JETON = 'leon-essai-coulisses';
const PROFONDEUR = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXE = /^(?:call|toolu|tool|fc)_/;
const FICHIER_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\.jsonl|\.json|\.txt|\.meta\.json)?$/i;
const ens = (mots) => new Set(mots.split(/\s+/).filter(Boolean));
// Les outils natifs de Cursor (LOCAL_TOOLS de cursor.ts, annexe 04) ; un outil MCP se masque.
const OUTILS = ens(`Read Write StrReplace ApplyPatch Delete Shell Grep Glob LS ReadLints SemanticSearch CodebaseSearch
  EditNotebook TodoWrite CreatePlan SwitchMode AskQuestion Task WebFetch WebSearch apply_patch codebase_search create_plan
  delete_file edit_file edit_notebook glob_file_search grep list_dir read_file read_lints run_terminal_cmd search_replace
  todo_write write web_search fetch_rules`);
// Les valeurs qui s'affichent, par clé. Toute autre valeur se masque.
const VALEURS = new Map(Object.entries({
  type: ens('text tool_use tool_result thinking redacted_thinking reasoning image turn_ended function'),
  role: ens('user assistant system tool'),
  status: ens('success error aborted completed cancelled canceled failed'),
  name: OUTILS,
}));
const IDS = ens(`id tool_use_id toolUseId conversation_id conversationId agent_id agentId subagent_id parent_id
  generation_id`);
const NOMBRES = ens('exit_code exitCode');
const BOOLEENS = ens('is_error');
// Les noms de clés qui se notent (cursor.ts, annexe 04) ; les autres, par leur longueur.
const CLES = ens(`role type message content text thinking signature reasoning id name input tool_use_id toolUseId
  is_error status model subagent_type conversation_id conversationId agent_id agentId subagent_id parent_id description
  prompt command path target_file pattern glob_pattern target_directory head_limit url query contents old_string
  new_string explanation timeout is_background todos merge mode options question file_path paths working_directory cwd
  tool_calls function arguments usage input_tokens output_tokens cache_read_tokens cache_write_tokens generation_id
  model_id timestamp duration_ms exit_code exitCode`);
// Sous ces clés, les arguments d'un appel : aucune valeur, seulement les noms de clés connus.
const ARGUMENTS = ens('input arguments tool_calls toolCalls function_call function');
// Sous ces clés (et sous le `content` d'un bloc `tool_result`), une sortie d'outil : ni valeur, ni nom de clé.
const DONNEES = ens('result output toolUseResult');
// Dans un bloc `tool_result`, les seules clés qui ne sont pas la sortie de l'outil.
const HORS_SORTIE = ens('type tool_use_id is_error');
// Les balises d'un message qui se nomment (cursor.ts et l'annexe 04) ; les autres sont seulement comptées.
const BALISES = new Set(['user_query', 'timestamp', 'system_reminder', 'subagent_results', 'subagent_result', 'think', 'thinking']);
// Les types de blocs que le relevé lit ; un autre type est compté dans formes_inattendues.
const BLOCS_LUS = /^(?:text|tool_use|tool_result|image)$|think|reason/i;
const NOMS = ens('agent-transcripts subagents terminals mcps tools');
const EXTENSIONS = ens('.jsonl .json .txt .md .log');

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
const sortieDOutil = (cle, parent) => DONNEES.has(cle) || (parent?.type === 'tool_result' && !HORS_SORTIE.has(cle));
const cadreDe = (cadre, cle, parent) =>
  cadre === 'donnees' || sortieDOutil(cle, parent) || !CLES.has(cle)
    ? 'donnees'
    : cadre === 'arguments' || ARGUMENTS.has(cle) ? 'arguments' : '';
const nomCle = (k, cadre = '') => (cadre !== 'donnees' && CLES.has(k) ? k : `<clé de ${k.length} caractères>`);
const extension = (n) => (EXTENSIONS.has(extname(n)) ? extname(n) : '');
const nomDe = (n) => (NOMS.has(n) || FICHIER_UUID.test(n) ? n : `<nom de ${n.length} caractères>${extension(n)}`);
const cheminNote = (rel) => rel.split('/').map(nomDe).join('/');

// Un identifiant ne s'affiche jamais : un numéro, le même pour le même identifiant le temps du relevé, et sa forme.
const pseudos = new Map();
const pseudo = (v) => {
  if (!pseudos.has(v)) pseudos.set(v, pseudos.size + 1);
  return `<id n°${pseudos.get(v)}, ${UUID.test(v) ? 'uuid' : (PREFIXE.exec(v)?.[0] ?? 'autre')}>`;
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
      fusionner((n.cles[nom] ??= noeud()), x, k, cadreDe(cadre, k, v), p + 1);
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

function forme(valeur) {
  const n = noeud();
  fusionner(n, valeur, '', '');
  return rendre(n, 1);
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
  for (const ligne of brut.split('\n')) {
    if (!ligne.trim()) continue;
    const v = json(ligne);
    if (objet(v)) lignes.push(v);
    else illisibles++;
  }
  return { lignes, illisibles, octets: (await stat(fichier)).size };
}
const lireSur = (fichier) => lire(fichier).catch((e) => ({ erreur: e.code ?? e.name }));

// Les fichiers sous un dossier, en profondeur, avec leur taille, sans suivre les liens.
async function fichiersSous(racine, rel = '') {
  const sortie = [];
  const entrees = await readdir(join(racine, rel), { withFileTypes: true }).catch((e) => {
    if (e.code !== 'ENOENT') sortie.push({ chemin: rel, erreur: e.code ?? e.name });
    return [];
  });
  for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) sortie.push(...(await fichiersSous(racine, chemin)));
    else if (e.isFile()) sortie.push({ chemin, octets: await stat(join(racine, chemin)).then((s) => s.size, (x) => `<${x.code ?? x.name}>`) });
    else sortie.push({ chemin, autre: 'lien ou fichier spécial, non suivi' });
  }
  return sortie;
}

// --- Les relevés d'un transcript ---
const etiquette = (l) => (typeof l.role === 'string' ? `role:${ident('role', l.role)}` : `type:${ident('type', l.type)}`);
const blocsDe = (l) => {
  const c = l.message?.content;
  return typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
};
// Le texte d'une ligne (ses blocs `text`). Ne sert qu'à des comparaisons et aux noms de balises.
const texteDe = (l) =>
  blocsDe(l)
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
// Un appel d'une autre forme : une de ces clés (sur la ligne, le message ou un bloc), un bloc d'un de ces types autre que
// tool_use, ou une ligne de ce type sans message.
const APPEL_AUTRE = ['tool_calls', 'toolCalls', 'function_call', 'function'];
const TYPES_D_APPEL = new Set(['tool_use', 'tool_call', 'function_call', 'function']);
const appelAutre = (o) => objet(o) && APPEL_AUTRE.some((k) => k in o);
// Chaque clé d'une valeur, avec le chemin noté de ses clés (sous une clé inconnue, des longueurs), hors des sorties
// d'outils. Le nom brut sert au test du raisonnement, jamais à l'affichage.
function* clesDe(v, chemin = '', cadre = '', p = 0) {
  if (p > PROFONDEUR) return;
  if (Array.isArray(v)) for (const x of v) yield* clesDe(x, `${chemin}[]`, cadre, p + 1);
  else if (objet(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (sortieDOutil(k, v)) continue;
      const ici = `${chemin}.${nomCle(k, cadre)}`;
      yield [ici, k, x];
      yield* clesDe(x, ici, cadreDe(cadre, k, v), p + 1);
    }
  }
}

function releve({ lignes, illisibles, octets }) {
  const r = {
    lignes: lignes.length,
    illisibles,
    octets,
    commence_par_user_query: lignes[0]?.role === 'user' && texteDe(lignes[0]).includes('<user_query>'),
    types_de_ligne: dict(),
    formes: dict(),
    blocs: dict(),
    raisonnement: dict(),
    balises_des_messages_user: dict(),
    balises_des_messages_assistant: dict(),
    // Ce que le relevé des appels ne sait pas lire : compté, jamais sauté en silence.
    formes_inattendues: { contenu_ni_chaine_ni_tableau: 0, appels_d_une_autre_forme: 0, blocs_d_un_autre_type: 0 },
  };
  const noeuds = dict();
  const resultats = dict();
  for (const l of lignes) for (const b of blocsDe(l)) if (b?.type === 'tool_result') resultats[b.tool_use_id] ??= b;
  const appels = [];
  lignes.forEach((l, i) => {
    const e = etiquette(l);
    compter(r.types_de_ligne, e);
    fusionner((noeuds[e] ??= noeud()), l, '', '');
    if (objet(l.message) && 'content' in l.message && typeof l.message.content !== 'string' && !Array.isArray(l.message.content)) {
      r.formes_inattendues.contenu_ni_chaine_ni_tableau++;
    }
    const blocs = blocsDe(l);
    r.formes_inattendues.appels_d_une_autre_forme +=
      [l, l.message].filter(appelAutre).length +
      blocs.filter((x) => appelAutre(x) || (objet(x) && x.type !== 'tool_use' && TYPES_D_APPEL.has(x.type))).length +
      (!objet(l.message) && TYPES_D_APPEL.has(l.type) ? 1 : 0);
    r.formes_inattendues.blocs_d_un_autre_type += blocs.filter((x) => !(typeof x?.type === 'string' && BLOCS_LUS.test(x.type))).length;
    const b = (r.blocs[e] ??= dict());
    for (const x of blocsDe(l)) {
      compter(b, ident('type', x?.type));
      if (x?.type === 'tool_use') {
        const res = typeof x.id === 'string' ? resultats[x.id] : undefined;
        appels.push({
          ligne: i + 1,
          name: ident('name', x.name),
          id: ident('id', x.id),
          input: objet(x.input) ? champs(x.input, 'arguments') : { type: typeDe(x.input), ...(typeof x.input === 'string' ? { longueur: x.input.length } : {}) },
          resultat: res
            ? { present: true, is_error: typeof res.is_error === 'boolean' ? res.is_error : '(absent)', contenu: formeContenu(res.content) }
            : { present: false },
        });
      }
      if (typeof x?.type !== 'string' || !/think|reason/i.test(x.type)) continue;
      const s = (r.raisonnement[ident('type', x.type)] ??= { blocs: 0, avec_texte: 0, texte_longueur_max: 0, cles: [] });
      s.blocs++;
      const n = Object.values(x).reduce((t, v) => t + (typeof v === 'string' && v !== x.type ? v.length : 0), 0);
      if (n > 0) s.avec_texte++;
      s.texte_longueur_max = Math.max(s.texte_longueur_max, n);
      for (const k of Object.keys(x)) if (!s.cles.includes(nomCle(k))) s.cles.push(nomCle(k));
    }
    // Une clé de raisonnement à toute profondeur, hors des sorties d'outils : le chemin noté de ses clés, la longueur du texte.
    for (const [chemin, k, v] of clesDe(l)) {
      if (!/think|thought|reason/i.test(k)) continue;
      const s = (r.raisonnement[`ligne${chemin}`] ??= { lignes: 0, texte_longueur_max: 0 });
      s.lignes++;
      s.texte_longueur_max = Math.max(s.texte_longueur_max, typeof v === 'string' ? v.length : 0);
    }
    // Les balises des messages : nommées si elles sont connues ; une balise de raisonnement d'un message assistant
    // (`<think>`) est aussi comptée sous raisonnement.
    const texte = l.role === 'user' || l.role === 'assistant' ? texteDe(l) : '';
    for (const m of texte.matchAll(/<([A-Za-z][\w:.-]{0,79})(?=[\s>/]|$)/g)) {
      const nom = BALISES.has(m[1]) ? m[1] : '(autre balise)';
      compter(l.role === 'user' ? r.balises_des_messages_user : r.balises_des_messages_assistant, nom);
      if (l.role === 'assistant' && /think|thought|reason/i.test(m[1])) (r.raisonnement[`balise <${nom}>`] ??= { messages: 0 }).messages++;
    }
  });
  for (const [e, n] of Object.entries(noeuds)) r.formes[e] = rendre(n, n.vus);
  return { ...r, appels };
}
const relever = (f) => (f.erreur ? { erreur: f.erreur } : sur(() => releve(f)));

// --- Les liens entre un sous-agent et sa conversation ---
// Chaque chaîne d'une ligne, avec le chemin de ses clés.
function* chaines(v, chemin = '', cadre = '', p = 0) {
  if (p > PROFONDEUR) return;
  if (typeof v === 'string') yield [chemin, v];
  else if (Array.isArray(v)) for (const x of v) yield* chaines(x, `${chemin}[]`, cadre, p + 1);
  else if (objet(v)) {
    for (const [k, x] of Object.entries(v)) yield* chaines(x, `${chemin}.${nomCle(k, cadre)}`, cadreDe(cadre, k, v), p + 1);
  }
}

function endroits(lignes, test) {
  const d = dict();
  for (const l of lignes) for (const [chemin, s] of chaines(l)) if (test(s)) compter(d, `${etiquette(l)} ${chemin}`);
  return d;
}

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

// Où une valeur d'une fiche `.json` vérifie le test : le chemin des clés, compté. Jamais la valeur.
function endroitsFiche(v, test) {
  const d = dict();
  for (const [chemin, s] of chaines(v)) if (test(s)) compter(d, chemin);
  return d;
}

// `fiche` : la fiche `.json` du même nom que le fichier du sous-agent, s'il y en a une (comme le meta.json de Claude Code).
function lier(conversation, sous, fiche) {
  const id = basename(sous.rel, '.jsonl');
  const role = (r) => sous.f.lignes.filter((l) => l.role === r).map(texteDe).filter(Boolean);
  const rapport = role('assistant').at(-1);
  const derniere = sous.f.lignes.at(-1);
  const fin = sous.f.lignes.filter((l) => l.type === 'turn_ended').at(-1);
  // Les identifiants des appels de la conversation : le lien de Claude Code passe par eux (toolUseId du meta.json).
  const ids = new Set(conversation.lignes.flatMap((l) => blocsDe(l).filter((b) => b?.type === 'tool_use' && typeof b.id === 'string').map((b) => b.id)));
  return {
    sous_agent: cheminNote(sous.rel),
    nom_du_fichier_dans_la_conversation: endroits(conversation.lignes, (s) => id.length >= 8 && s.includes(id)),
    conversation_dans_le_sous_agent: endroits(sous.f.lignes, (s) => conversation.id.length >= 8 && s.includes(conversation.id)),
    id_d_un_appel_dans_le_sous_agent: endroits(sous.f.lignes, (s) => ids.has(s)),
    id_d_un_appel_dans_sa_fiche: fiche === undefined ? null : endroitsFiche(fiche, (s) => ids.has(s)),
    consignes: role('user').map((t, i) => ({ rang: i + 1, ...retrouver(conversation.lignes, t) })),
    rapport: rapport === undefined ? null : retrouver(conversation.lignes, rapport),
    fin: { derniere_ligne: derniere ? etiquette(derniere) : null, dernier_turn_ended: fin ? ident('status', fin.status) : null },
  };
}

// --- Le rapport ---
function refuser(message) {
  console.error(message);
  process.exit(2);
}

async function main() {
  if (!process.argv[2]) refuser("Usage : node cursor-coulisses.mjs <dossier de projet de Cursor de l'essai, chemin absolu>");
  const projet = resolve(process.argv[2]);
  const reel = await realpath(projet).catch(() => projet);
  // Le jeton dans le nom même du dossier de projet, pas dans un dossier parent.
  if (!basename(projet).includes(JETON) || !basename(reel).includes(JETON)) {
    refuser(`Refusé : le nom du dossier ne porte pas le jeton ${JETON}. Ce script ne lit que les sessions d'essai.`);
  }
  // Un dossier illisible ou absent ne doit pas se lire comme un essai sans conversation.
  await readdir(projet).catch((e) => refuser(`Refusé : le dossier de projet est illisible ou absent (${e.code ?? e.name}).`));
  const tous = await fichiersSous(projet);
  // agent-transcripts lui-même (illisible, en lien) reste dans la liste, avec son code ou sa mention.
  const transcrit = (x) => x.chemin === 'agent-transcripts' || x.chemin.startsWith('agent-transcripts/');
  const dansTranscripts = tous.filter(transcrit);
  // Hors de agent-transcripts/ : le premier niveau, et un compte de fichiers.
  const horsTranscripts = dict();
  for (const x of tous) if (!transcrit(x)) compter(horsTranscripts, nomDe(x.chemin.split('/')[0]));
  // Une conversation : `agent-transcripts/<id>/<id>.jsonl` (et tout ce qui est sous `<id>/`), ou `<id>.jsonl` à plat.
  // Seuls les `.jsonl` (et les `.json` sous `<id>/`) s'ouvrent ; les autres fichiers sont comptés, jamais ouverts.
  const conversations = dict();
  const nonOuverts = dict();
  for (const x of dansTranscripts) {
    if (typeof x.octets !== 'number') continue;
    const [, premier, ...reste] = x.chemin.split('/');
    const aPlat = reste.length === 0;
    if (!x.chemin.endsWith('.jsonl') && (aPlat || !x.chemin.endsWith('.json'))) {
      compter(nonOuverts, extension(x.chemin) || '<autre>');
      continue;
    }
    const id = aPlat ? basename(premier, '.jsonl') : premier;
    const c = (conversations[id] ??= { id, principaux: [], autres: [] });
    if (aPlat || (reste.length === 1 && reste[0] === `${id}.jsonl`)) c.principaux.push(x.chemin);
    else c.autres.push(x.chemin);
  }
  const sortie = [];
  for (const c of Object.values(conversations)) {
    // Deux fichiers principaux pour une même conversation (à plat et imbriqué) : les deux sont relevés, rien n'est écrasé.
    const [premier, ...doublons] = c.principaux;
    const principal = premier === undefined ? null : await lireSur(join(projet, premier));
    const sous = [];
    const fiches = [];
    for (const rel of c.autres) {
      if (rel.endsWith('.jsonl')) sous.push({ rel, f: await lireSur(join(projet, rel)) });
      else {
        const texte = await readFile(join(projet, rel), 'utf8').catch((e) => ({ erreur: e.code ?? e.name }));
        fiches.push({ rel, v: typeof texte === 'string' ? json(texte) : undefined, erreur: texte.erreur });
      }
    }
    // La fiche d'un sous-agent : un `.json` voisin dont le nom commence par celui du fichier (`<id>.json`, `<id>.meta.json`).
    const ficheDe = (s) =>
      fiches.find((x) => x.rel.slice(0, x.rel.lastIndexOf('/')) === s.rel.slice(0, s.rel.lastIndexOf('/')) &&
        basename(x.rel).startsWith(`${basename(s.rel, '.jsonl')}.`))?.v;
    const lisible = principal && !principal.erreur;
    sortie.push({
      conversation: nomDe(c.id), // un nom de fichier : UUID ou nom connu, sinon sa longueur
      fichier: premier === undefined ? null : cheminNote(premier),
      forme_du_fichier: premier === undefined ? null : premier.split('/').length === 2 ? 'a_plat' : 'imbrique',
      ...(principal ? relever(principal) : {}),
      doublons: await Promise.all(doublons.map(async (d) => ({ fichier: cheminNote(d), ...relever(await lireSur(join(projet, d))) }))),
      fiches_json: fiches.map((x) => ({
        fichier: cheminNote(x.rel),
        forme: x.erreur ? { erreur: x.erreur } : x.v === undefined ? { illisible: true } : sur(() => forme(x.v)),
      })),
      sous_agents: sous.map((s) => ({ fichier: cheminNote(s.rel), ...relever(s.f) })),
      liens: lisible ? sous.filter((s) => !s.f.erreur).map((s) => sur(() => lier({ id: c.id, lignes: principal.lignes }, s, ficheDe(s)))) : [],
    });
  }
  const rapport = {
    outil: { node: process.version, date: new Date().toISOString() },
    dossier_de_projet: {
      agent_transcripts: dansTranscripts.map((x) => ({ ...x, chemin: cheminNote(x.chemin) })),
      non_ouverts: nonOuverts,
      hors_transcripts: horsTranscripts,
    },
    conversations: sortie,
  };
  console.log(JSON.stringify(rapport, null, 2));
}

main().catch((e) => {
  console.error(`Erreur : ${e.code ?? e.name}`); // jamais le message : il pourrait citer un bout de la session
  process.exit(1);
});
