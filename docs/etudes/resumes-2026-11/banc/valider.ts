// Vérifie les jeux d'essai : la forme de chaque fichier (types.ts), la cohérence de l'attendu, et que le vrai prompt
// de Leon se construit. Sans appel à un modèle.
// Usage (racine du worktree) : npx tsx docs/etudes/resumes-2026-11/banc/valider.ts [étape…]

import './env-factice';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CAPTURE_KINDS, ITEM_NATURES, SOURCE_KINDS, TURN_ROLES } from '@/capture/turn';
import { chargerCas, chargerCorpus, ETAPES, type Etape, JEUX, preparer, type UnCas } from './jeux';
import type {
  Attendu,
  CasAgenda,
  CasDiscussion,
  CasFil,
  CasPoint,
  CasReponse,
  CasResume,
  Source,
  Tour,
  TourSession,
} from './types';

const erreurs: string[] = [];
const err = (cas: string, message: string) => erreurs.push(`${cas} : ${message}`);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const PARIS = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const date = (id: string, champ: string, v: unknown) => {
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v)))
    err(id, `${champ} : date ISO avec fuseau attendue, reçu ${JSON.stringify(v)}`);
};
const chaine = (id: string, champ: string, v: unknown, vide = false) => {
  if (typeof v !== 'string' || (!vide && v.trim() === '')) err(id, `${champ} : texte attendu`);
};
const dans = (id: string, champ: string, v: unknown, liste: readonly string[]) => {
  if (!liste.includes(v as string)) err(id, `${champ} : ${JSON.stringify(v)} n'est pas dans ${liste.join(', ')}`);
};

function attendu(id: string, a: Attendu) {
  if (!a || !Array.isArray(a.faits) || !Array.isArray(a.interdits) || !Array.isArray(a.pieges)) {
    err(id, 'attendu : faits, interdits et pieges sont des listes');
    return;
  }
  const ids = new Set<string>();
  for (const f of [...a.faits, ...a.interdits]) {
    chaine(id, 'attendu.id', f.id);
    chaine(id, `attendu ${f.id}.texte`, f.texte);
    if (ids.has(f.id)) err(id, `attendu : id ${f.id} en double`);
    ids.add(f.id);
  }
  for (const f of a.faits) if (![1, 2, 3].includes(f.poids)) err(id, `fait ${f.id} : poids 1, 2 ou 3`);
}

function source(id: string, champ: string, s: Source) {
  chaine(id, `${champ}.id`, s.id);
  dans(id, `${champ}.kind`, s.kind, SOURCE_KINDS);
  dans(id, `${champ}.nature`, s.nature, ITEM_NATURES);
  date(id, `${champ}.date`, s.date);
}
function tour(id: string, champ: string, t: Tour) {
  dans(id, `${champ}.role`, t.role, TURN_ROLES);
  date(id, `${champ}.date`, t.date);
  chaine(id, `${champ}.texte`, t.texte);
}
function tourSession(id: string, champ: string, t: TourSession, vus: Set<string>) {
  chaine(id, `${champ}.id`, t.id);
  if (vus.has(t.id)) err(id, `${champ} : id de tour ${t.id} en double`);
  vus.add(t.id);
  dans(id, `${champ}.role`, t.role, ['user', 'assistant']);
  if (t.role === 'assistant' && t.injecte !== null) err(id, `${champ} : injecte vaut null pour un tour assistant`);
  if (t.role === 'user' && ![true, false, null].includes(t.injecte)) err(id, `${champ} : injecte true, false ou null`);
  date(id, `${champ}.date`, t.date);
  chaine(id, `${champ}.texte`, t.texte);
}
function faitsSession(id: string, champ: string, f: CasResume['entree']['faits']) {
  for (const sha of f.commits ?? []) if (!/^[0-9a-f]{7,40}$/.test(sha)) err(id, `${champ}.commits : ${sha} n'est pas un sha`);
  for (const pr of f.prs ?? []) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(pr.repo)) err(id, `${champ}.prs : repo « propriétaire/dépôt »`);
    dans(id, `${champ}.prs.etat`, pr.etat, ['open', 'merged', 'closed', null] as unknown as string[]);
  }
  for (const t of f.taches ?? []) dans(id, `${champ}.taches.etat`, t.etat, ['a_faire', 'en_cours', 'fait']);
  for (const c of f.commandes ?? []) if (typeof c.erreur !== 'boolean') err(id, `${champ}.commandes.erreur : booléen`);
  if (!Array.isArray(f.fichiers)) err(id, `${champ}.fichiers : liste`);
}
// Les ids qu'une décision peut citer : une PR « repo#n », un commit, un tour tapé par la personne.
function preuvesSession(f: CasResume['entree']['faits'], tours: TourSession[]): Set<string> {
  return new Set([
    ...f.prs.map((p) => `${p.repo}#${p.numero}`),
    ...f.commits,
    ...tours.filter((t) => t.role === 'user' && t.injecte === false).map((t) => t.id),
  ]);
}

function verifier(etape: Etape, cas: UnCas, fichier: string) {
  const id = `${etape}/${fichier}`;
  if (cas.id !== fichier.replace(/\.json$/, '')) err(id, `id « ${cas.id} » différent du nom du fichier`);
  if (!/^[a-z0-9-]+\.json$/.test(fichier)) err(id, 'nom de fichier : ASCII, minuscules, tirets');
  chaine(id, 'titre', cas.titre);
  dans(id, 'langue', cas.langue, ['fr', 'en', 'de', 'es']);
  attendu(id, cas.attendu);
  switch (etape) {
    case 'point': {
      const c = cas as CasPoint;
      const e = c.entree;
      date(id, 'maintenant', e.maintenant);
      date(id, 'depuis', e.depuis);
      chaine(id, 'projet', e.projet);
      if (e.sessions.length > 3) err(id, 'sessions : 3 au plus');
      if (e.changements.length > 10) err(id, 'changements : 10 au plus');
      if (e.mentions.length > 10) err(id, 'mentions : 10 au plus');
      e.sessions.forEach((s, i) => {
        source(id, `sessions[${i}].source`, s.source);
        if (!(CAPTURE_KINDS as readonly string[]).includes(s.source.kind)) err(id, `sessions[${i}] : une session de code`);
        s.tours.forEach((t, j) => tour(id, `sessions[${i}].tours[${j}]`, t));
      });
      e.changements.forEach((s, i) => {
        source(id, `changements[${i}].source`, s.source);
        s.tours.forEach((t, j) => tour(id, `changements[${i}].tours[${j}]`, t));
      });
      e.mentions.forEach((m, i) => {
        source(id, `mentions[${i}].source`, m.source);
        tour(id, `mentions[${i}].tour`, m.tour);
      });
      if (!c.attendu.rien && !c.attendu.faits.some((f) => f.id === c.attendu.premier))
        err(id, `attendu.premier « ${c.attendu.premier} » n'est pas un fait`);
      break;
    }
    case 'resume': {
      const c = cas as CasResume;
      const vus = new Set<string>();
      faitsSession(id, 'faits', c.entree.faits);
      c.entree.tours.forEach((t, j) => tourSession(id, `tours[${j}]`, t, vus));
      const tapes = c.entree.tours.filter((t) => t.role === 'user' && t.injecte === false).length;
      if (!c.attendu.rien && tapes < 6) err(id, `${tapes} tours tapés : Leon ne résume qu'à partir de 6 (RESUME_MIN_ECHANGES)`);
      const preuves = preuvesSession(c.entree.faits, c.entree.tours);
      for (const d of c.attendu.decisions ?? []) {
        if (!d.sources.some((s) => preuves.has(s)))
          err(id, `décision « ${d.texte.slice(0, 40)} » : aucune source valable (${d.sources.join(', ')})`);
      }
      if (!Array.isArray(c.attendu.decisions)) err(id, 'attendu.decisions : liste');
      break;
    }
    case 'fil': {
      const c = cas as CasFil;
      const vus = new Set<string>();
      c.entree.sessions.forEach((s, i) => {
        chaine(id, `sessions[${i}].id`, s.id);
        dans(id, `sessions[${i}].kind`, s.kind, ['claude_code', 'codex', 'cursor', 'antigravity']);
        date(id, `sessions[${i}].date`, s.date);
        faitsSession(id, `sessions[${i}].faits`, s.faits);
        s.tours.forEach((t, j) => tourSession(id, `sessions[${i}].tours[${j}]`, t, vus));
      });
      c.entree.sources.forEach((s, i) => {
        chaine(id, `sources[${i}].id`, s.id);
        dans(id, `sources[${i}].kind`, s.kind, SOURCE_KINDS);
        chaine(id, `sources[${i}].externalId`, s.externalId);
        chaine(id, `sources[${i}].texte`, s.texte);
        if (s.date !== null) date(id, `sources[${i}].date`, s.date);
      });
      if (!Array.isArray(c.attendu.decisions)) err(id, 'attendu.decisions : liste');
      break;
    }
    case 'agenda': {
      const c = cas as CasAgenda;
      const { periode, mails } = c.entree;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periode.first) || !/^\d{4}-\d{2}-\d{2}$/.test(periode.last))
        err(id, 'periode : AAAA-MM-JJ');
      mails.forEach((m, i) => {
        chaine(id, `mails[${i}].sourceId`, m.sourceId);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(m.at)) err(id, `mails[${i}].at : « 2026-11-14T09:12 » (heure de Paris)`);
        chaine(id, `mails[${i}].text`, m.text);
      });
      for (const r of c.attendu.rdv) {
        if (!PARIS.test(r.debut)) err(id, `rdv ${r.titre} : debut « AAAA-MM-JJTHH:MM » ou « AAAA-MM-JJ »`);
        if (r.fin && !PARIS.test(r.fin)) err(id, `rdv ${r.titre} : fin mal formée`);
        if (r.debut.slice(0, 10) < periode.first || r.debut.slice(0, 10) > periode.last) err(id, `rdv ${r.titre} : hors période`);
        for (const n of [r.n, ...(r.autresN ?? [])]) if (n < 1 || n > mails.length) err(id, `rdv ${r.titre} : mail n=${n} inexistant`);
      }
      break;
    }
    case 'reponse': {
      const c = cas as CasReponse;
      chaine(id, 'recherche', c.entree.recherche);
      const passages = new Set<string>();
      c.entree.resultats.forEach((r, i) => {
        chaine(id, `resultats[${i}].id`, r.id);
        dans(id, `resultats[${i}].kind`, r.kind, SOURCE_KINDS);
        dans(id, `resultats[${i}].nature`, r.nature, ITEM_NATURES);
        date(id, `resultats[${i}].date`, r.date);
        r.passages.forEach((p, j) => {
          chaine(id, `resultats[${i}].passages[${j}].id`, p.id);
          if (passages.has(p.id)) err(id, `passage ${p.id} en double`);
          passages.add(p.id);
          date(id, `resultats[${i}].passages[${j}].date`, p.date);
          chaine(id, `resultats[${i}].passages[${j}].texte`, p.texte);
          if (p.texte.length > 600) err(id, `passage ${p.id} : 600 caractères au plus`);
        });
      });
      for (const n of c.attendu.cites ?? []) if (n < 1 || n > c.entree.resultats.length) err(id, `cites : ${n} hors des résultats`);
      if (!Array.isArray(c.attendu.cites)) err(id, 'attendu.cites : liste');
      break;
    }
    case 'discussion': {
      const c = cas as CasDiscussion;
      chaine(id, 'question', c.entree.question);
      try {
        const corpus = chargerCorpus(c.entree.corpus);
        const ids = new Set(corpus.sources.map((s) => s.id));
        for (const s of c.attendu.sources ?? []) if (!ids.has(s)) err(id, `attendu.sources : ${s} absent du corpus`);
        if (!c.attendu.jeNeSaisPas && (c.attendu.sources ?? []).length === 0) err(id, 'attendu.sources : vide');
      } catch {
        err(id, `corpus « ${c.entree.corpus} » introuvable`);
      }
      break;
    }
  }
}

function verifierCorpus() {
  const dossier = join(JEUX, 'discussion');
  let fichiers: string[] = [];
  try {
    fichiers = readdirSync(dossier).filter((f) => f.startsWith('corpus-') && f.endsWith('.json'));
  } catch {}
  for (const f of fichiers) {
    const id = `discussion/${f}`;
    const corpus = chargerCorpus(f.replace(/\.json$/, ''));
    chaine(id, 'entreprise', corpus.entreprise);
    chaine(id, 'utilisateur', corpus.utilisateur);
    date(id, 'maintenant', corpus.maintenant);
    const sources = new Set<string>();
    const tours = new Set<string>();
    corpus.sources.forEach((s, i) => {
      if (sources.has(s.id)) err(id, `source ${s.id} en double`);
      sources.add(s.id);
      dans(id, `sources[${i}].kind`, s.kind, SOURCE_KINDS);
      dans(id, `sources[${i}].nature`, s.nature, ITEM_NATURES);
      s.tours.forEach((t, j) => {
        if (tours.has(t.id)) err(id, `tour ${t.id} en double`);
        tours.add(t.id);
        tour(id, `sources[${i}].tours[${j}]`, t);
      });
    });
    console.log(`${id} : ${corpus.sources.length} sources, ${tours.size} tours`);
  }
}

const demandees = process.argv.slice(2) as Etape[];
for (const etape of demandees.length > 0 ? demandees : ETAPES) {
  if (!ETAPES.includes(etape)) {
    console.error(`étape inconnue : ${etape}`);
    process.exit(2);
  }
  const dossier = join(JEUX, etape);
  let fichiers: string[] = [];
  try {
    fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json') && !f.startsWith('corpus-')).sort();
  } catch {}
  const tous = chargerCas(etape);
  for (const [i, cas] of tous.entries()) {
    const fichier = fichiers[i] as string;
    const avant = erreurs.length;
    try {
      verifier(etape, cas, fichier);
      if (etape !== 'discussion' && erreurs.length === avant) {
        const p = await preparer(etape, cas);
        const taille = p.system.length + p.messages.reduce((s, m) => s + m.content.length, 0);
        console.log(`ok ${etape}/${fichier} : prompt ${taille} caractères (~${Math.round(taille / 3.6)} jetons)`);
      } else if (erreurs.length === avant) console.log(`ok ${etape}/${fichier}`);
    } catch (e) {
      err(`${etape}/${fichier}`, `illisible : ${(e as Error).message}`);
    }
  }
  if (etape === 'discussion') verifierCorpus();
}
if (erreurs.length > 0) {
  console.error(`\n${erreurs.length} erreur(s) :\n${erreurs.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('\nAucune erreur.');
process.exit(0);
