// Charge les jeux d'essai et construit, pour chaque cas, le prompt que Leon enverrait vraiment (les fonctions de
// src/server), puis applique à la réponse le même traitement que le serveur (filtres, liste blanche, lecture du JSON).
// Les modules importés ici sont purs, sauf resume-worker.ts et tools.ts : ils lisent l'environnement à l'import
// (env.ts), d'où l'environnement factice posé par lancer.ts et valider.ts.

import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { buildAgendaPrompt, parseAgendaAnswer } from '@/server/agenda/agenda-prompt';
import { buildAnswerPrompt } from '@/server/answer/answer-prompt';
import { buildBriefingPrompt } from '@/server/briefing/briefing-prompt';
import type { BriefingExcerpt, BriefingMaterial } from '@/server/briefing/gather';
import type { ChatMessage } from '@/server/llm/llm';
import { createReferenceFilter, referencedNumbers } from '@/server/llm/references';
import { type CondenseFacts, condenseSession } from '@/server/sessions/condense';
import { buildResumePrompt, RIEN_A_RETENIR } from '@/server/sessions/resume-prompt';
import { buildFilPrompt, condenseFil, filterFilState } from '@/server/sessions/thread-state';
import type { SourceHit, SourceInfo } from '@/server/search/types';
import type {
  CasAgenda,
  CasDiscussion,
  CasFil,
  CasPoint,
  CasReponse,
  CasResume,
  Corpus,
  FaitsSession,
  Source,
  Tour,
  TourSession,
} from './types';

export const ETAPES = ['point', 'resume', 'fil', 'agenda', 'reponse', 'discussion'] as const;
export type Etape = (typeof ETAPES)[number];
export type UnCas = CasPoint | CasResume | CasFil | CasAgenda | CasReponse | CasDiscussion;

// Effort de réflexion et longueur maximale de chaque étape, repris de src/server (models.ts, les *_MAX_TOKENS).
export const REGLAGES: Record<Etape, { effort: 'low' | 'medium'; maxTokens: number }> = {
  point: { effort: 'medium', maxTokens: 8000 },
  resume: { effort: 'low', maxTokens: 4000 },
  fil: { effort: 'low', maxTokens: 6000 },
  agenda: { effort: 'low', maxTokens: 6000 },
  reponse: { effort: 'low', maxTokens: 1500 },
  discussion: { effort: 'medium', maxTokens: 8000 },
};

// « modèle@variante+variante » : l'id OpenRouter, les variantes, et l'effort qu'elles donnent à l'étape.
export function lireModele(modele: string, etape: Etape) {
  const [id, suite] = modele.split('@') as [string, string | undefined];
  const variantes = suite?.split('+') ?? [];
  const effort = variantes.includes('sans-reflexion') ? 'none' : variantes.includes('effort-bas') ? 'low' : REGLAGES[etape].effort;
  return { id, variantes, effort } as const;
}

export const RACINE = join(import.meta.dirname, '..');
// SERIE=v2 range sorties, vérifications et tableaux dans resultats/v2 (une série par version des prompts) ;
// JEUX=jeux-validation lit un autre jeu d'essai.
export const RESULTATS = join(RACINE, 'resultats', process.env.SERIE ?? '');
export const JEUX = join(RACINE, process.env.JEUX ?? 'jeux');

export function chargerCas(etape: Etape): UnCas[] {
  const dossier = join(JEUX, etape);
  let fichiers: string[];
  try {
    fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json') && !f.startsWith('corpus-'));
  } catch {
    return [];
  }
  return fichiers.sort().map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as UnCas);
}

export function chargerCorpus(nom: string): Corpus {
  return JSON.parse(readFileSync(join(JEUX, 'discussion', `${nom}.json`), 'utf8')) as Corpus;
}

// Ce que le banc envoie au modèle et sait faire de sa réponse.
export type Prepare = {
  system: string;
  messages: ChatMessage[];
  // La réponse brute du modèle devient ce que l'utilisateur verrait, avec quelques mesures déterministes.
  traiter(reponse: string): { rendu: string; mesures: Record<string, number | string | boolean | null> };
};

// --- point ---

// La coupe de gather.ts : le début du texte, « … » s'il est plus long.
const couper = (texte: string, max: number) =>
  texte.length <= max ? texte : `${texte.slice(0, max).trimEnd()}…`;

const sourceInfo = (s: Source): SourceInfo => ({
  sourceId: s.id,
  kind: s.kind,
  nature: s.nature,
  title: s.titre,
  url: s.url ?? null,
  origin: {},
  lastTs: new Date(s.date),
});
const extrait = (t: Tour): BriefingExcerpt => ({
  role: t.role,
  authorName: t.auteur ?? null,
  ts: new Date(t.date),
  text: couper(t.texte, t.role === 'user' ? 1000 : 400),
});

const mots = (texte: string) => texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
const RIEN_POINT = /^(nothing to report|rien à signaler|rien de neuf)\W*$/i;

function preparerPoint(cas: CasPoint): Prepare {
  const e = cas.entree;
  const material: BriefingMaterial = {
    project: e.projet,
    since: new Date(e.depuis),
    sessions: e.sessions.map(({ source, tours }) => ({
      source: sourceInfo(source),
      turns: tours.slice(-24).map(extrait),
    })),
    changes: e.changements.map(({ source, tours }) => ({
      source: sourceInfo(source),
      turns: tours.slice(-24).map(extrait),
    })),
    mentions: e.mentions.map(({ source, tour }, i) => ({
      source: sourceInfo(source),
      passageId: `p${i}`,
      excerpt: extrait(tour),
    })),
  };
  const prompt = buildBriefingPrompt(
    material,
    new Date(e.maintenant),
    e.apropos ?? null,
    e.poste ?? null,
    e.regles ?? [],
  );
  const permis = new Set(prompt.references.map((r) => r.n));
  return {
    system: prompt.system,
    messages: prompt.messages,
    traiter(reponse) {
      const cites = referencedNumbers(reponse);
      const filtre = createReferenceFilter(permis);
      const rendu = (filtre.push(reponse) + filtre.flush()).trim();
      const puces = rendu.split('\n').filter((l) => /^\s*[-*]\s/.test(l)).length;
      const parties = rendu.split('\n').filter((l) => /^##\s/.test(l)).length;
      return {
        rendu,
        mesures: {
          mots: mots(rendu),
          tropLong: mots(rendu) > 250,
          puces,
          parties,
          renvoisInvalides: cites.filter((n) => !permis.has(n)).length,
          renvois: cites.length,
          rien: RIEN_POINT.test(rendu),
        },
      };
    },
  };
}

// --- resume ---

function faitsCondense(faits: FaitsSession, tours: TourSession[]): CondenseFacts {
  return {
    branche: faits.branche,
    prs: faits.prs.map((pr) => ({ repo: pr.repo, numero: pr.numero, etat: pr.etat })),
    commits: faits.commits,
    fichiers: faits.fichiers,
    commandes: faits.commandes,
    taches: faits.taches,
    erreurs: faits.commandes.filter((c) => c.erreur).length,
    externe: faits.externe ?? false,
    echanges: tours.filter((t) => t.role === 'user' && t.injecte === false).length,
    debut: faits.debut,
    fin: faits.fin,
  };
}
const toursCondense = (tours: TourSession[]) =>
  tours.map((t) => ({
    id: t.id,
    externalId: t.id,
    role: t.role,
    ts: new Date(t.date),
    text: t.texte,
    injecte: t.role === 'user' ? t.injecte : null,
  }));

const estRien = (reponse: string) =>
  reponse
    .trim()
    .replace(/[.!\s]+$/u, '')
    .toLowerCase() === RIEN_A_RETENIR;

// Les [décision] gardées et leurs sources, lues dans le texte rendu.
function decisionsGardees(rendu: string): Array<{ texte: string; sources: string[] }> {
  return rendu
    .split('\n')
    .filter((l) => l.startsWith('- [décision]'))
    .map((l) => {
      const m = /\((?:de\s*:[^;()]*;\s*)?sources?\s*:\s*([^()]*)\)\s*$/iu.exec(l);
      return { texte: l, sources: (m?.[1] ?? '').split(/[\s,;]+/).filter(Boolean) };
    });
}

async function preparerResume(cas: CasResume): Promise<Prepare> {
  const { filterResume } = await import('@/server/sessions/resume-worker');
  const faits = faitsCondense(cas.entree.faits, cas.entree.tours);
  const condense = condenseSession({ faits, turns: toursCondense(cas.entree.tours) });
  const prompt = buildResumePrompt(condense);
  return {
    system: prompt.system,
    messages: prompt.messages,
    traiter(reponse): ReturnType<Prepare['traiter']> {
      if (estRien(reponse)) return { rendu: RIEN_A_RETENIR, mesures: { rien: true, decisions: 0 } };
      const factsServeur = {
        ...faits,
        prs: faits.prs.map((p) => ({ repo: p.repo, numero: p.numero, par: 'pr-link' as const })),
      };
      const rendu = filterResume(reponse, condense.preuves, factsServeur) ?? '';
      const brutes = reponse.split('\n').filter((l) => /^\s*-\s*\[d[ée]cision\]/i.test(l)).length;
      const gardees = decisionsGardees(rendu);
      return {
        rendu,
        mesures: {
          rien: false,
          vide: rendu === '',
          caracteres: rendu.length,
          decisions: gardees.length,
          decisionsRetirees: brutes - gardees.length,
          formatRespecte: /^## Où j'en suis/m.test(reponse),
        },
      };
    },
  };
}

// --- fil ---

function preparerFil(cas: CasFil): Prepare {
  const condense = condenseFil({
    sessions: cas.entree.sessions.map((s) => ({
      id: s.id,
      kind: s.kind,
      date: new Date(s.date),
      faits: faitsCondense(s.faits, s.tours),
      resume: s.resume,
      turns: toursCondense(s.tours),
    })),
    sources: cas.entree.sources.map((s) => ({
      ...s,
      date: s.date === null ? null : new Date(s.date),
    })),
  });
  const prompt = buildFilPrompt(condense);
  return {
    system: prompt.system,
    messages: prompt.messages,
    traiter(reponse) {
      const lignesBrutes = reponse.split('\n').filter((l) => /^\s*-\s*\[/.test(l)).length;
      const filtre = filterFilState(reponse, condense);
      const rendu = filtre?.texte ?? '';
      const gardees = rendu.split('\n').filter((l) => /^\s*-\s*\[/.test(l)).length;
      return {
        rendu,
        mesures: {
          vide: rendu === '',
          caracteres: rendu.length,
          lignesRetirees: lignesBrutes - gardees,
          decisions: decisionsGardees(rendu).length,
          formatRespecte: /^## Où j'en suis/m.test(reponse),
        },
      };
    },
  };
}

// --- agenda ---

function preparerAgenda(cas: CasAgenda): Prepare {
  const { mails, periode } = cas.entree;
  const prompt = buildAgendaPrompt(mails, periode);
  return {
    system: prompt.system,
    messages: prompt.messages,
    traiter(reponse) {
      const trouves = parseAgendaAnswer(reponse, mails, periode);
      const attendus = cas.attendu.rdv;
      // Un rendez-vous trouvé vaut un attendu s'il commence au même moment (à la minute, ou le même jour quand
      // l'attendu n'a pas d'heure) ; chaque attendu ne compte qu'une fois.
      const pris = new Set<number>();
      let justes = 0;
      const faux: string[] = [];
      for (const r of trouves) {
        const i = attendus.findIndex(
          (a, k) =>
            !pris.has(k) &&
            (a.debut === r.debut || (a.debut.length === 10 && r.debut.startsWith(a.debut))),
        );
        if (i === -1) faux.push(`${r.debut} ${r.titre}`);
        else {
          pris.add(i);
          justes++;
        }
      }
      const manques = attendus.filter((_, k) => !pris.has(k)).map((a) => `${a.debut} ${a.titre}`);
      const rappel = attendus.length === 0 ? (trouves.length === 0 ? 1 : 0) : justes / attendus.length;
      const precision = trouves.length === 0 ? (attendus.length === 0 ? 1 : 0) : justes / trouves.length;
      return {
        rendu: trouves.map((r) => `${r.debut}${r.fin ? `→${r.fin}` : ''} ${r.titre}${r.avec ? ` (avec ${r.avec})` : ''}`).join('\n'),
        mesures: {
          trouves: trouves.length,
          attendus: attendus.length,
          justes,
          rappel: Number(rappel.toFixed(3)),
          precision: Number(precision.toFixed(3)),
          f1: rappel + precision === 0 ? 0 : Number(((2 * rappel * precision) / (rappel + precision)).toFixed(3)),
          faux: faux.join(' | '),
          manques: manques.join(' | '),
        },
      };
    },
  };
}

// --- reponse ---

const PAS_ASSEZ = 'Les résultats ne suffisent pas pour répondre.';

function preparerReponse(cas: CasReponse): Prepare {
  const { recherche, resultats } = cas.entree;
  const hits: SourceHit[] = resultats.map((r, i) => ({
    sourceId: r.id,
    kind: r.kind,
    nature: r.nature,
    title: r.titre,
    url: r.url ?? null,
    origin: {},
    lastTs: new Date(r.date),
    score: resultats.length - i,
    passages: r.passages.map((p) => ({
      passageId: p.id,
      turnId: p.id,
      snippet: p.texte.slice(0, 200),
      ts: new Date(p.date),
      authorName: p.auteur ?? null,
      role: p.role ?? null,
    })),
  }));
  const texts = new Map(resultats.flatMap((r) => r.passages.map((p) => [p.id, p.texte] as const)));
  const prompt = buildAnswerPrompt(recherche, {
    resultIds: resultats.map((r) => r.id),
    hits,
    texts,
  });
  const permis = new Set(prompt.numbered.map((p) => p.n));
  return {
    system: prompt.system,
    messages: prompt.messages,
    traiter(reponse) {
      const cites = [...new Set(referencedNumbers(reponse))];
      const filtre = createReferenceFilter(permis);
      const rendu = (filtre.push(reponse) + filtre.flush()).trim();
      const attendus = cas.attendu.cites;
      return {
        rendu,
        mesures: {
          mots: mots(rendu),
          tropLong: mots(rendu) > 120,
          pasAssez: rendu.includes(PAS_ASSEZ),
          renvoisInvalides: cites.filter((n) => !permis.has(n)).length,
          renvoisAttendusCites:
            attendus.length === 0
              ? null
              : Number((attendus.filter((n) => cites.includes(n)).length / attendus.length).toFixed(3)),
        },
      };
    },
  };
}

export async function preparer(etape: Etape, cas: UnCas): Promise<Prepare> {
  switch (etape) {
    case 'point':
      return preparerPoint(cas as CasPoint);
    case 'resume':
      return preparerResume(cas as CasResume);
    case 'fil':
      return preparerFil(cas as CasFil);
    case 'agenda':
      return preparerAgenda(cas as CasAgenda);
    case 'reponse':
      return preparerReponse(cas as CasReponse);
    case 'discussion':
      throw new Error('la discussion passe par discussion.ts (agent avec outils)');
  }
}

// Une vérification (noter.ts) : ce que le vérificateur a trouvé dans une sortie.
export type Verif = {
  faits: Record<string, number>; // 1 dit clairement, 0.5 en partie ou vaguement, 0 absent
  interdits: Record<string, number>; // 1 la sortie le dit
  contraires: string[]; // faits que la sortie contredit
  premier: string | null; // point : le fait que dit la première puce
  langueOk: boolean;
};
export const cheminVerif = (sortie: string, v: string) =>
  sortie.replace(`${sep}sorties${sep}`, `${sep}verifs${sep}`).replace(/\.json$/, `.${v.replace(/[/:]/g, '__')}.json`);

export type { CasDiscussion };

