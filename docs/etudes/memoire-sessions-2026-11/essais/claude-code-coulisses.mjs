#!/usr/bin/env node
// Le témoin des coulisses de Claude Code (essai T50 du plan mémoire des sessions), sur le modèle des témoins de Cursor et
// d'Antigravity. Il relève la FORME d'une session de test : sous quelle forme Claude Code 2.1.322 écrit, dans ses
// fichiers de session, le raisonnement de l'agent, les appels d'outils et les échanges des sous-agents. Node seul, sans
// dépendance.
//
//   node claude-code-coulisses.mjs <chemin absolu du .jsonl de la session de test>
//
// Il écrit un rapport JSON indenté sur la sortie standard, et rien sur le disque. Il lit le fichier donné, et le dossier
// voisin du même nom sans `.jsonl` (sous-agents, résultats d'outils), en profondeur.
//
// Règle n°1, la forme, jamais un texte : le rapport ne contient jamais le contenu d'une chaîne de la session, seulement
// sa longueur. Seule exception : une liste fermée de clés dont la valeur est un identifiant technique (type, role,
// model, agentId...), notée si elle ressemble à un identifiant (lettres, chiffres, _ . : @ / -, 80 caractères au plus),
// sinon réduite à sa longueur. Les noms de fichiers et de dossiers et les tailles en octets se notent ; les nombres et
// les booléens aussi dans les relevés par appel (dans les formes fusionnées, seulement leur type).
//
// Règle n°2, une garde contre les vraies sessions : le script refuse de tourner (code 2) si le chemin résolu ne contient
// pas le jeton `leon-essai-coulisses`. Le dépôt jetable de l'essai porte ce jeton dans son nom, donc le dossier de projet
// de Claude Code aussi ; une vraie session de travail n'en a pas.
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const JETON = 'leon-essai-coulisses';
const IDENTIFIANT = /^[A-Za-z0-9_.:@/-]{1,80}$/;
const FERMEE = new Set([
  'type', 'subtype', 'role', 'stop_reason', 'model', 'version', 'userType', 'agentId', 'agentType', 'subagent_type',
  'sessionId', 'status', 'name', 'id', 'tool_use_id', 'toolUseID', 'parentToolUseID', 'sourceToolAssistantUUID', 'uuid',
  'parentUuid', 'entrypoint', 'permissionMode', 'isSidechain', 'isMeta', 'is_error', 'run_in_background',
]);

const BOOLEENS = new Set(['isSidechain', 'isMeta', 'is_error', 'run_in_background']);

const dict = () => Object.create(null);
const compter = (d, cle) => {
  d[cle] = (d[cle] ?? 0) + 1;
};
const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const sha = (texte) => createHash('sha256').update(texte).digest('hex');
// Un identifiant technique tel quel, tout autre texte par sa longueur.
const ident = (v) =>
  typeof v === 'string'
    ? IDENTIFIANT.test(v) ? v : `<texte de ${v.length} caractères>`
    : v === undefined ? '(absent)' : `<${typeDe(v)}>`;
const nomCle = (k) => (IDENTIFIANT.test(k) ? k : `<clé de ${k.length} caractères>`);
const estRole = (l, role) => (l.message?.role ?? l.type) === role;
const blocsDe = (l) => {
  const c = l.message?.content;
  return typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
};
const texteDe = (c) =>
  typeof c === 'string'
    ? c
    : Array.isArray(c) ? c.filter((x) => x?.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n') : '';

// --- La forme fusionnée de plusieurs valeurs : clés, types, longueurs, présence, valeurs de la liste fermée ---
const noeud = () => ({ vus: 0, types: dict(), valeurs: new Set(), cles: dict(), objets: 0, tableaux: 0, nbElements: 0, parType: dict() });

function autorisee(parent, cle, v) {
  if (!FERMEE.has(cle)) return undefined;
  if ((cle === 'name' || cle === 'id') && parent?.type !== 'tool_use') return undefined;
  if (BOOLEENS.has(cle)) return typeof v === 'boolean' ? v : undefined; // un texte ici n'est pas un identifiant
  return typeof v === 'boolean' || (typeof v === 'string' && IDENTIFIANT.test(v)) ? v : undefined;
}

function fusionner(n, v, parent, cle) {
  n.vus++;
  const t = typeDe(v);
  compter(n.types, t);
  if (t === 'string') {
    n.min = Math.min(n.min ?? Infinity, v.length);
    n.max = Math.max(n.max ?? 0, v.length);
  }
  const retenue = autorisee(parent, cle, v);
  if (retenue !== undefined) n.valeurs.add(retenue);
  if (t === 'object') {
    n.objets++;
    for (const [k, x] of Object.entries(v)) fusionner((n.cles[nomCle(k)] ??= noeud()), x, v, k);
  }
  if (t === 'array') {
    n.tableaux++;
    for (const x of v) {
      n.nbElements++;
      const typee = x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.type === 'string';
      fusionner(typee ? (n.parType[ident(x.type)] ??= noeud()) : (n.elements ??= noeud()), x, v, cle);
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
  fusionner(n, valeur, null, '');
  return rendre(n, 1);
}

const longueurDe = (x) => (typeof x?.text === 'string' ? x.text.length : JSON.stringify(x).length);
const formeContenu = (c) =>
  typeof c === 'string'
    ? { chaine: c.length }
    : Array.isArray(c)
      ? { tableau: c.map((x) => ({ type: ident(x?.type), longueur: longueurDe(x) })) }
      : { type: typeDe(c) };

// --- Lecture ---
async function lire(fichier) {
  const brut = await readFile(fichier, 'utf8');
  const lignes = [];
  let illisibles = 0;
  for (const ligne of brut.split('\n')) {
    if (!ligne.trim()) continue;
    try {
      const v = JSON.parse(ligne);
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) lignes.push(v);
      else illisibles++;
    } catch {
      illisibles++;
    }
  }
  return { lignes, illisibles, octets: (await stat(fichier)).size };
}

async function parcourir(racine, rel = '') {
  const sortie = [];
  const entrees = await readdir(join(racine, rel), { withFileTypes: true });
  for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = join(rel, e.name);
    if (e.isDirectory()) sortie.push(...(await parcourir(racine, chemin)));
    else if (e.isFile()) sortie.push({ chemin, octets: (await stat(join(racine, chemin))).size });
    else sortie.push({ chemin, autre: 'lien ou fichier spécial, non suivi' });
  }
  return sortie;
}

// --- Les relevés d'un fichier de session ---
const etiquette = (l) =>
  ident(l.type) +
  (l.subtype === undefined ? '' : `/${ident(l.subtype)}`) +
  (l.type === 'attachment' ? `/${ident(l.attachment?.type)}` : '');

function blocsEtRaisonnement(r, l) {
  const m = l.message;
  const b = (r.blocs[ident(m.role ?? l.type)] ??= { contenu_chaine: 0, contenu_tableau: 0, blocs: dict() });
  if (typeof m.content === 'string') b.contenu_chaine++;
  if (!Array.isArray(m.content)) return;
  b.contenu_tableau++;
  for (const x of m.content) {
    compter(b.blocs, ident(x?.type));
    if (x?.type !== 'thinking' && x?.type !== 'redacted_thinking') continue;
    const vide = { blocs: 0, avec_texte: 0, texte_longueur_max: 0, avec_signature: 0, cles: [] };
    const s = ((r.raisonnement[ident(m.model)] ??= dict())[x.type] ??= vide);
    s.blocs++;
    if (typeof x.thinking === 'string' && x.thinking) {
      s.avec_texte++;
      s.texte_longueur_max = Math.max(s.texte_longueur_max, x.thinking.length);
    }
    if (typeof x.signature === 'string' && x.signature) s.avec_signature++;
    for (const k of Object.keys(x)) if (!s.cles.includes(nomCle(k))) s.cles.push(nomCle(k));
  }
}

function balisesDe(l, numero) {
  const c = l.message?.content;
  const texte = typeof c === 'string' ? c : Array.isArray(c) ? c.find((x) => x?.type === 'text')?.text : undefined;
  if (l.type !== 'user' || typeof texte !== 'string' || !texte.trimStart().startsWith('<')) return null;
  const noms = dict();
  for (const m of texte.matchAll(/<([A-Za-z][\w:.-]{0,79})(?=[\s>/]|$)/g)) compter(noms, m[1]);
  return { ligne: numero, noms };
}

// Chaque tool_use avec son tool_result (cherché par tool_use_id) et la ligne qui le porte.
function appelsBruts(lignes) {
  const resultats = dict();
  for (const l of lignes) {
    for (const b of blocsDe(l)) if (b?.type === 'tool_result') resultats[b.tool_use_id] ??= { bloc: b, ligne: l };
  }
  return lignes.flatMap((l) => blocsDe(l).filter((b) => b?.type === 'tool_use').map((bloc) => ({ bloc, res: resultats[bloc.id] })));
}

const valeurDe = (cle, v) => {
  const t = typeDe(v);
  if (t === 'string') {
    return { type: t, longueur: v.length, ...(cle === 'subagent_type' ? { valeur: ident(v) } : {}) };
  }
  if (t === 'array') return { type: t, longueur: v.length };
  if (t === 'object') return { type: t, nombre_de_cles: Object.keys(v).length };
  return { type: t, valeur: v };
};

function decrire({ bloc, res }) {
  const input = dict();
  if (bloc.input !== null && typeof bloc.input === 'object') {
    for (const [k, v] of Object.entries(bloc.input)) input[nomCle(k)] = valeurDe(k, v);
  }
  const resultat = res
    ? {
        present: true,
        is_error: typeof res.bloc.is_error === 'boolean' ? res.bloc.is_error : 'absent',
        contenu: formeContenu(res.bloc.content),
        toolUseResult: 'toolUseResult' in res.ligne ? forme(res.ligne.toolUseResult) : 'absent',
      }
    : { present: false };
  return { id: ident(bloc.id), name: ident(bloc.name), input, resultat };
}

function releve({ lignes, illisibles, octets }) {
  const r = { lignes: lignes.length, illisibles, octets, types_de_ligne: dict(), formes: dict(), blocs: dict(), raisonnement: dict() };
  const noeuds = dict();
  const balises = [];
  lignes.forEach((l, i) => {
    compter(r.types_de_ligne, etiquette(l));
    fusionner((noeuds[ident(l.type)] ??= noeud()), l, null, '');
    if (l.message !== null && typeof l.message === 'object') blocsEtRaisonnement(r, l);
    const b = balisesDe(l, i + 1);
    if (b) balises.push(b);
  });
  for (const [t, n] of Object.entries(noeuds)) r.formes[t] = rendre(n, n.vus);
  return { ...r, appels: appelsBruts(lignes).map(decrire), balises };
}

// --- Les sous-agents ---
const resume = (l) =>
  l && {
    type: ident(l.type),
    role: ident(l.message?.role),
    contenu: formeContenu(l.message?.content),
    stop_reason: ident(l.message?.stop_reason),
  };

// Un message de l'API peut être écrit sur plusieurs lignes (un bloc par ligne) : on les regroupe par message.id.
function dernierMessage(lignes) {
  const tous = lignes.filter((l) => estRole(l, 'assistant'));
  const id = tous.at(-1)?.message?.id;
  return id === undefined ? tous.slice(-1) : tous.filter((l) => l.message?.id === id);
}

function sousAgent(chemin, f, voisins, principal) {
  const sidechain = dict();
  for (const l of f.lignes) {
    compter(sidechain, typeof l.isSidechain === 'boolean' ? String(l.isSidechain) : l.isSidechain === undefined ? 'absent' : 'autre');
  }
  const vus = (cle) => [...new Set(f.lignes.map((l) => l[cle]).filter((v) => v !== undefined))];
  const groupe = dernierMessage(f.lignes);
  const blocs = groupe.flatMap(blocsDe);
  return {
    chemin,
    ...releve(f),
    isSidechain: sidechain,
    agentId: vus('agentId').map(ident),
    sessionId: vus('sessionId').map(ident),
    sessionId_egal_au_fichier_principal: vus('sessionId').length > 0 && vus('sessionId').every((v) => v === principal),
    premiere_ligne: resume(f.lignes[0]) ?? null,
    derniere_ligne: resume(f.lignes.at(-1)) ?? null,
    dernier_message_assistant:
      groupe.length === 0
        ? null
        : {
            lignes_du_message: groupe.length,
            stop_reason: groupe.map((l) => ident(l.message?.stop_reason)),
            types_des_blocs: blocs.map((b) => ident(b?.type)),
            contient_tool_use: blocs.some((b) => b?.type === 'tool_use'),
          },
    voisins: voisins.map((v) => ({ chemin: v.chemin, octets: v.octets, ...(v.forme ? { forme: v.forme } : {}) })),
  };
}

// --- Les liens entre un appel Agent ou Task et un fichier de sous-agent ---
function ou(v, test, chemin) {
  if (typeof v === 'string') return test(v) ? chemin : null;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) {
    const trouve = ou(x, test, `${chemin}.${nomCle(k)}`);
    if (trouve !== null) return trouve;
  }
  return null;
}

// Deux textes : identiques (par sha256) ou, sinon, l'un contient l'autre. Jamais le texte, seulement des booléens.
function comparer(nom, contenu, a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return { [`${nom}_comparable`]: false };
  const identique = sha(a) === sha(b);
  return { [`${nom}_identique`]: identique, ...(identique ? {} : { [contenu]: Boolean(a && b) && (a.includes(b) || b.includes(a)) }) };
}

function lier(dans, { bloc, res }, sous) {
  const id = bloc.id;
  const prompt = typeof bloc.input?.prompt === 'string' ? bloc.input.prompt : null;
  const texte = res ? texteDe(res.bloc.content) : null;
  const tur = res?.ligne.toolUseResult;
  const trouves = [];
  for (const s of sous.filter((x) => x.chemin !== dans)) {
    const dansTur = ou(tur, (x) => s.ids.has(x), 'toolUseResult');
    if (dansTur) trouves.push({ chemin: s.chemin, par: dansTur });
    if (texte && [...s.ids].some((x) => texte.includes(x))) trouves.push({ chemin: s.chemin, par: 'texte_du_resultat' });
    for (const m of s.metas) {
      const dansMeta = ou(m.json, (x) => x === id, m.nom);
      if (dansMeta) trouves.push({ chemin: s.chemin, par: dansMeta });
    }
    if (s.f.lignes.some((l) => l.parentToolUseID === id || l.toolUseID === id)) {
      trouves.push({ chemin: s.chemin, par: 'ligne.parentToolUseID/toolUseID' });
    }
  }
  const relies = [...new Set(trouves.map((t) => t.chemin))];
  const lien = {
    dans,
    tool_use_id: ident(id),
    prompt_longueur: prompt?.length ?? null,
    endroits: {
      toolUseResult: tur === undefined ? 'absent' : forme(tur),
      texte_du_resultat_contient_un_agentId: texte === null ? null : sous.some((s) => [...s.ids].some((x) => texte.includes(x))),
      meta_json_a_une_valeur_egale_au_tool_use_id: sous.some((s) => s.metas.some((m) => ou(m.json, (x) => x === id, '') !== null)),
    },
    fichier: relies[0] ?? null,
    par: trouves.filter((t) => t.chemin === relies[0]).map((t) => t.par),
    fichiers_relies: relies,
  };
  const cible = sous.find((s) => s.chemin === relies[0]);
  if (cible) {
    const consigne = texteDe(cible.f.lignes.find((l) => estRole(l, 'user'))?.message?.content);
    const rapport = texteDe(dernierMessage(cible.f.lignes).flatMap(blocsDe));
    Object.assign(lien, comparer('consigne', 'consigne_contenue', prompt, consigne), comparer('rapport', 'rapport_contenu', texte, rapport));
  }
  return lien;
}

function chercherLiens(principal, sous) {
  const liens = [];
  for (const [dans, f] of [['principal', principal], ...sous.map((s) => [s.chemin, s.f])]) {
    for (const a of appelsBruts(f.lignes)) {
      if (a.bloc.name === 'Agent' || a.bloc.name === 'Task') liens.push(lier(dans, a, sous));
    }
  }
  const reliees = new Set(liens.flatMap((x) => x.fichiers_relies));
  for (const x of liens) if (!x.fichier) x.fichiers_non_relies = sous.map((s) => s.chemin).filter((c) => !reliees.has(c));
  return liens;
}

// --- Le rapport ---
function refuser(message) {
  console.error(message);
  process.exit(2);
}

async function main() {
  const chemin = resolve(process.argv[2] ?? '');
  if (!process.argv[2] || !chemin.endsWith('.jsonl')) {
    refuser('Usage : node claude-code-coulisses.mjs <chemin absolu du .jsonl de la session de test>');
  }
  const dossier = chemin.slice(0, -'.jsonl'.length);
  for (const p of [chemin, dossier]) {
    const reel = await realpath(p).catch(() => p); // il n'existe pas : le chemin résolu suffit
    if (!p.includes(JETON) || !reel.includes(JETON)) {
      refuser(`Refusé : le chemin ne contient pas le jeton ${JETON}. Ce script ne lit que les sessions d'essai.`);
    }
  }
  const principal = await lire(chemin);
  const liste = await parcourir(dossier).catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return null;
  });
  const jsons = dict();
  for (const fic of (liste ?? []).filter((x) => x.chemin.endsWith('.json'))) {
    const json = await readFile(join(dossier, fic.chemin), 'utf8').then(JSON.parse, () => undefined);
    jsons[fic.chemin] = { json, forme: json === undefined ? { illisible: true } : forme(json) };
  }
  const sous = [];
  for (const fic of (liste ?? []).filter((x) => x.chemin.endsWith('.jsonl'))) {
    const f = await lire(join(dossier, fic.chemin));
    const racine = basename(fic.chemin, '.jsonl');
    const voisin = (x) =>
      x.chemin !== fic.chemin && dirname(x.chemin) === dirname(fic.chemin) && basename(x.chemin).startsWith(`${racine}.`);
    const voisins = liste.filter(voisin);
    const ids = new Set([racine.replace(/^agent-/, ''), ...f.lignes.map((l) => l.agentId).filter((v) => typeof v === 'string' && v)]);
    const metas = voisins
      .filter((v) => jsons[v.chemin]?.json !== undefined)
      .map((v) => ({ nom: basename(v.chemin), json: jsons[v.chemin].json }));
    sous.push({ chemin: fic.chemin, f, ids, metas, voisins: voisins.map((v) => ({ ...v, forme: jsons[v.chemin]?.forme })) });
  }
  const nomPrincipal = basename(chemin, '.jsonl');
  const rapport = {
    outil: { node: process.version, date: new Date().toISOString() },
    session: { fichier: basename(chemin), ...releve(principal) },
    dossier: liste && liste.map((x) => ({ ...x, ...(jsons[x.chemin] ? { forme: jsons[x.chemin].forme } : {}) })),
    sous_agents: sous.map((s) => sousAgent(s.chemin, s.f, s.voisins, nomPrincipal)),
    liens: chercherLiens(principal, sous),
  };
  console.log(JSON.stringify(rapport, null, 2));
}

main().catch((e) => {
  console.error(`Erreur : ${e.code ?? e.name}`); // jamais le message : il pourrait citer un bout de la session
  process.exit(1);
});
