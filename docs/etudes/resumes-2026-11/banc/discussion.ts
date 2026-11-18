// La discussion de Leon rejouée sur un corpus fictif : le vrai prompt (DISCUSSION_SYSTEM, sans les deux outils GitHub
// en direct), la vraie numérotation et le vrai rendu des sources (tools.ts, render.ts), mais une recherche simple par
// mots dans le corpus au lieu de Postgres + vecteurs. La boucle suit anthropic-llm.ts : au-delà de 8 appels d'outils,
// la réponse s'arrête (« limite ») avec le texte déjà écrit.
// shortcut: recherche lexicale seulement (pas de vecteurs), plus dure que la vraie pour les questions reformulées ;
// à remplacer par la vraie recherche si l'écart entre modèles se joue sur la recherche.

import { DISCUSSION_SYSTEM, buildDiscussionMessages } from '@/server/discussion/discussion-prompt';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { createReferenceFilter, referencedNumbers } from '@/server/llm/references';
import { renderHit, renderTurn, sourceAttributes } from '@/server/mcp/tools/render';
import type { ContextTurn, SourceHit, SourceInfo } from '@/server/search/types';
import { chargerCorpus, lireModele, REGLAGES } from './jeux';
import { ajouter, type AppelOutil, appeler, type Message, type Outil, type Usage, usageVide } from './openrouter';
import type { CasDiscussion, SourceCorpus } from './types';

const MAX_ETAPES = 8;
const BUDGET_LECTURE = 40_000;
const SOURCE_MAX = 20_000;
const VOISINS = 2;

// Le prompt réel, sans les outils GitHub en direct, que le banc n'a pas.
export const SYSTEME_BANC = DISCUSSION_SYSTEM.split('\n')
  .filter((l) => !l.startsWith('- depots_github') && !l.startsWith('- lire_github') && !l.startsWith('- Les outils …_github'))
  .join('\n');

const OUTILS: Outil[] = [
  {
    type: 'function',
    function: {
      name: 'chercher',
      description:
        'Cherche dans toute la mémoire brute de l’entreprise (conversations avec des IA, tickets, pages, réunions, mails, fichiers) par mots-clés et par sens, avec des filtres facultatifs. Rend jusqu’à 10 sources numérotées avec leurs meilleurs extraits. Ne rend que ce que l’utilisateur a le droit de voir. Les extraits sont courts : lis un passage avec lire avant de t’en servir.',
      parameters: {
        type: 'object',
        properties: {
          requete: {
            type: 'string',
            description:
              'Les mots à chercher, ou une question en phrase. Les sources qui contiennent tous les mots passent devant celles qui n’en contiennent qu’une partie. Pour resserrer : "guillemets droits" pour une expression exacte, -mot pour écarter un mot. Reformule et relance si les résultats ne conviennent pas.',
          },
          outil: { type: 'string', description: 'Limite à un outil, par son identifiant ou son nom : github, linear, notion, outlook, claude_code, fathom…' },
          type: { type: 'string', description: 'Limite à une nature : conversation, reunion, page, ticket, fil, note, mail, fichier, evenement, commit.' },
          de: { type: 'string', description: "Limite à ce qu'une personne a écrit : son nom, son e-mail ou son identifiant d'outil." },
          depuis: { type: 'string', description: 'Limite aux éléments récents : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.' },
        },
        required: ['requete'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lire',
      description:
        'Lit le texte que Leon a gardé : un passage (passageId) avec les tours qui l’entourent, ou une source déjà rendue pendant cette réponse (sourceId), du début. Un seul des deux. Ne lit que ce que l’utilisateur a le droit de voir. Chaque lecture décompte un budget de caractères par réponse.',
      parameters: {
        type: 'object',
        properties: {
          passageId: { type: 'string', description: `Un passage rendu par chercher ou activite : on lit son tour et les ${VOISINS} tours avant et après.` },
          sourceId: { type: 'string', description: 'Une source déjà rendue pendant cette réponse (attribut id de <source>) : on la lit dans l’ordre, du début.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'activite',
      description:
        'Liste l’activité récente : les sources qui ont bougé depuis une date, les plus récentes d’abord, filtrées par personne ou par outil, avec leur dernier passage. Sans mot à chercher : pour « qu’a fait Julie cette semaine » ou « quoi de neuf sur GitHub ». Ne rend que ce que l’utilisateur a le droit de voir.',
      parameters: {
        type: 'object',
        properties: {
          depuis: { type: 'string', description: 'Limite aux éléments récents : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.' },
          de: { type: 'string', description: "Limite à ce qu'une personne a écrit : son nom, son e-mail ou son identifiant d'outil." },
          outil: { type: 'string', description: 'Limite à un outil, par son identifiant ou son nom.' },
        },
        required: ['depuis'],
      },
    },
  },
];

const VIDES = new Set(
  'le la les un une des de du et ou à au aux en dans sur pour par avec est sont a qui que quoi quel quelle quels quelles comment pourquoi où ce cette ces on nous vous il elle ils elles je tu mon ma mes son sa ses leur nos the a an of to in on for and or is are was were be what which who how why when where did do does with from at by it this that these those we you they i my our your their has have had'.split(' '),
);
const normaliser = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const motsDe = (t: string) => normaliser(t).split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 1 && !VIDES.has(m));
// Une racine grossière : « migrations » trouve « migration », « déployé » trouve « déploiement ».
const racine = (m: string) => (m.length > 5 ? m.slice(0, Math.max(5, m.length - 3)) : m);

type Index = {
  corpus: ReturnType<typeof chargerCorpus>;
  info: Map<string, SourceInfo>;
  passages: Array<{ source: SourceCorpus; tour: SourceCorpus['tours'][number]; mots: Set<string> }>;
  idf: Map<string, number>;
};

const caches = new Map<string, Index>();
function indexer(nom: string): Index {
  const connu = caches.get(nom);
  if (connu) return connu;
  const corpus = chargerCorpus(nom);
  const info = new Map<string, SourceInfo>();
  const passages: Index['passages'] = [];
  for (const source of corpus.sources) {
    const dates = source.tours.map((t) => Date.parse(t.date));
    info.set(source.id, {
      sourceId: source.id,
      kind: source.kind,
      nature: source.nature,
      title: source.titre,
      url: source.url ?? null,
      origin: {},
      lastTs: new Date(Math.max(...dates)),
    });
    for (const tour of source.tours) {
      const mots = new Set([...motsDe(`${source.titre ?? ''} ${tour.texte}`)].map(racine));
      passages.push({ source, tour, mots });
    }
  }
  const df = new Map<string, number>();
  for (const p of passages) for (const m of p.mots) df.set(m, (df.get(m) ?? 0) + 1);
  const idf = new Map([...df].map(([m, n]) => [m, Math.log(1 + passages.length / n)]));
  const index = { corpus, info, passages, idf };
  caches.set(nom, index);
  return index;
}

function depuisDate(valeur: string | undefined, maintenant: Date): Date | null {
  if (!valeur) return null;
  const v = valeur.trim().toLowerCase();
  const rel = /^(\d+)\s*([jdswm])$/.exec(v);
  if (rel) {
    const n = Number(rel[1]);
    const jours = rel[2] === 's' || rel[2] === 'w' ? 7 * n : rel[2] === 'm' ? 30 * n : n;
    return new Date(maintenant.getTime() - jours * 86_400_000);
  }
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : new Date(d);
}

const correspond = (filtre: string | undefined, ...valeurs: Array<string | null | undefined>) =>
  !filtre || valeurs.some((v) => v && normaliser(v).includes(normaliser(filtre.trim())));

function extrait(texte: string, mots: string[]): string {
  const bas = normaliser(texte);
  const i = Math.max(0, ...mots.map((m) => bas.indexOf(m)).filter((i) => i >= 0).slice(0, 1));
  const debut = Math.max(0, i - 80);
  return `${debut > 0 ? '…' : ''}${texte.slice(debut, debut + 280)}${debut + 280 < texte.length ? '…' : ''}`;
}

type Numerotation = { numero(id: string): number; connu(id: string): number | null; permis(): Set<number> };
function numerotation(): Numerotation {
  const par = new Map<string, number>();
  return {
    numero(id) {
      const n = par.get(id) ?? par.size + 1;
      par.set(id, n);
      return n;
    },
    connu: (id) => par.get(id) ?? null,
    permis: () => new Set(par.values()),
  };
}

function rendreHits(hits: SourceHit[], num: Numerotation): string {
  if (hits.length === 0) return 'Aucun résultat.';
  return [
    DATA_GUARD_LINE,
    `${hits.length} source${hits.length > 1 ? 's' : ''}. Cite une source par son numéro n.`,
    ...hits.map((h) => renderHit(h, num.numero(h.sourceId))),
  ].join('\n');
}

function executer(
  index: Index,
  num: Numerotation,
  budget: { reste: number },
  nom: string,
  args: Record<string, string | undefined>,
): string {
  const maintenant = new Date(index.corpus.maintenant);
  const hitDe = (source: SourceCorpus, tours: SourceCorpus['tours'], mots: string[], score: number): SourceHit => ({
    ...(index.info.get(source.id) as SourceInfo),
    score,
    passages: tours.map((t) => ({
      passageId: t.id,
      turnId: t.id,
      snippet: extrait(t.texte, mots),
      ts: new Date(t.date),
      authorName: t.auteur,
      role: t.role,
    })),
  });
  if (nom === 'chercher') {
    const requete = args.requete ?? '';
    const exclus = [...requete.matchAll(/(?:^|\s)-([\p{L}\p{N}]+)/gu)].map((m) => racine(normaliser(m[1] as string)));
    const termes = [...new Set(motsDe(requete.replace(/(?:^|\s)-[\p{L}\p{N}]+/gu, ' ')).map(racine))];
    if (termes.length === 0) return 'Aucun résultat.';
    const depuis = depuisDate(args.depuis, maintenant);
    const parSource = new Map<string, Array<{ tour: SourceCorpus['tours'][number]; score: number; n: number }>>();
    for (const p of index.passages) {
      const info = index.info.get(p.source.id) as SourceInfo;
      if (!correspond(args.outil, p.source.kind, info.kind)) continue;
      if (!correspond(args.type, p.source.nature)) continue;
      if (!correspond(args.de, p.tour.auteur)) continue;
      if (depuis && Date.parse(p.tour.date) < depuis.getTime()) continue;
      if (exclus.some((m) => p.mots.has(m))) continue;
      const trouves = termes.filter((m) => p.mots.has(m));
      if (trouves.length === 0) continue;
      const score = trouves.reduce((s, m) => s + (index.idf.get(m) ?? 0), 0) * (1 + trouves.length / termes.length);
      const liste = parSource.get(p.source.id) ?? [];
      liste.push({ tour: p.tour, score, n: trouves.length });
      parSource.set(p.source.id, liste);
    }
    const classes = [...parSource.entries()]
      .map(([id, liste]) => {
        liste.sort((a, b) => b.score - a.score);
        const meilleurs = liste.slice(0, 3);
        return { id, liste: meilleurs, score: (meilleurs[0]?.score ?? 0) + 0.2 * (meilleurs[1]?.score ?? 0) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const hits = classes.map(({ id, liste, score }) => {
      const source = index.corpus.sources.find((s) => s.id === id) as SourceCorpus;
      return hitDe(source, liste.map((l) => l.tour), termes, score);
    });
    return rendreHits(hits, num);
  }
  if (nom === 'activite') {
    const depuis = depuisDate(args.depuis, maintenant);
    if (!depuis) return 'Donne depuis : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.';
    const hits = index.corpus.sources
      .filter((s) => correspond(args.outil, s.kind) && s.tours.some((t) => correspond(args.de, t.auteur)))
      .map((s) => ({ s, info: index.info.get(s.id) as SourceInfo }))
      .filter(({ info }) => info.lastTs >= depuis)
      .sort((a, b) => b.info.lastTs.getTime() - a.info.lastTs.getTime())
      .slice(0, 20)
      .map(({ s }) => hitDe(s, s.tours.slice(-1), [], 0));
    return rendreHits(hits, num);
  }
  if (nom === 'lire') {
    const { passageId, sourceId } = args;
    if (!passageId === !sourceId) return 'Donne passageId ou sourceId, un seul des deux.';
    if (budget.reste <= 0)
      return `Lecture refusée : budget de lecture atteint (40 000 caractères lus pendant cette réponse). Réponds avec ce que tu as déjà lu, ou dis ce qui te manque.`;
    const place = Math.min(budget.reste, SOURCE_MAX);
    let source: SourceCorpus | undefined;
    let tours: ContextTurn[];
    if (passageId) {
      source = index.corpus.sources.find((s) => s.tours.some((t) => t.id === passageId));
      if (!source) return 'Source ou passage introuvable, ou non visible.';
      const i = source.tours.findIndex((t) => t.id === passageId);
      tours = source.tours.slice(Math.max(0, i - VOISINS), i + VOISINS + 1).map((t) => ({
        turnId: t.id,
        role: t.role,
        authorName: t.auteur,
        ts: new Date(t.date),
        text: t.texte,
        isHit: t.id === passageId,
      }));
    } else {
      if (num.connu(sourceId as string) === null)
        return 'Source inconnue dans cette réponse : lis une source rendue par chercher ou activite (attribut id de <source>), ou un passage par son passageId.';
      source = index.corpus.sources.find((s) => s.id === sourceId);
      if (!source) return 'Source ou passage introuvable, ou non visible.';
      tours = source.tours.map((t) => ({
        turnId: t.id,
        role: t.role,
        authorName: t.auteur,
        ts: new Date(t.date),
        text: t.texte,
        isHit: false,
      }));
    }
    let reste = place;
    let coupe = false;
    const gardes: ContextTurn[] = [];
    for (const t of tours) {
      if (reste <= 0) {
        coupe = true;
        break;
      }
      if (t.text.length > reste) coupe = true;
      gardes.push({ ...t, text: t.text.slice(0, reste) });
      reste -= Math.min(t.text.length, reste);
    }
    budget.reste -= place - reste;
    const n = num.numero(source.id);
    return [
      DATA_GUARD_LINE,
      `<source${sourceAttributes(index.info.get(source.id) as SourceInfo, n)}>`,
      ...gardes.map(renderTurn),
      '</source>',
      ...(coupe ? ['Lecture coupée : la suite n’est pas rendue. Cherche un passage précis avec chercher.'] : []),
      `Il te reste ${Math.max(0, budget.reste)} caractères de lecture pour cette réponse.`,
    ].join('\n');
  }
  return `Outil inconnu : ${nom}`;
}

export async function jouerDiscussion(
  modele: string,
  cas: CasDiscussion,
): Promise<{
  reponse: string;
  rendu: string;
  mesures: Record<string, number | string | boolean | null>;
  usage: Usage;
  latenceMs: number;
  fournisseur: string | null;
  trace: string[];
}> {
  const index = indexer(cas.entree.corpus);
  const num = numerotation();
  const budget = { reste: BUDGET_LECTURE };
  const historique = [...(cas.entree.historique ?? []), { role: 'user' as const, content: cas.entree.question }];
  const messages: Message[] = [
    { role: 'system', content: SYSTEME_BANC },
    ...buildDiscussionMessages(historique, []).map((m) => ({ role: m.role, content: m.content }) as Message),
  ];
  let usage = usageVide();
  let latence = 0;
  let fournisseur: string | null = null;
  let texte = '';
  let etapes = 0;
  let fin = 'fini';
  const trace: string[] = [];
  for (let tour = 0; tour < 12; tour++) {
    const r = await appeler({
      modele: lireModele(modele, 'discussion').id,
      messages,
      maxTokens: REGLAGES.discussion.maxTokens,
      effort: lireModele(modele, 'discussion').effort,
      outils: OUTILS,
    });
    usage = ajouter(usage, r.usage);
    latence += r.latenceMs;
    fournisseur ??= r.fournisseur;
    if (r.texte.trim() !== '') texte += (texte === '' ? '' : '\n\n') + r.texte.trim();
    if (r.appels.length === 0) {
      if (r.fin === 'length') fin = 'limite';
      break;
    }
    messages.push({ role: 'assistant', content: r.texte || null, tool_calls: r.appels });
    let arret = false;
    for (const appel of r.appels as AppelOutil[]) {
      if (etapes >= MAX_ETAPES) {
        arret = true;
        break;
      }
      etapes++;
      let args: Record<string, string | undefined> = {};
      try {
        args = JSON.parse(appel.function.arguments || '{}');
      } catch {}
      trace.push(`${appel.function.name} ${JSON.stringify(args)}`);
      messages.push({ role: 'tool', tool_call_id: appel.id, content: executer(index, num, budget, appel.function.name, args) });
    }
    if (arret) {
      fin = 'limite';
      break;
    }
  }
  const filtre = createReferenceFilter(num.permis());
  const rendu = (filtre.push(texte) + filtre.flush()).trim();
  const cites = referencedNumbers(texte);
  const attendues = cas.attendu.sources.map((id) => num.connu(id));
  const citesIds = new Set(referencedNumbers(rendu));
  return {
    reponse: texte,
    rendu,
    mesures: {
      fin,
      etapes,
      vide: rendu === '',
      renvoisInvalides: cites.filter((n) => !num.permis().has(n)).length,
      sourcesAttenduesVues:
        attendues.length === 0 ? null : Number((attendues.filter((n) => n !== null).length / attendues.length).toFixed(3)),
      sourcesAttenduesCitees:
        attendues.length === 0
          ? null
          : Number((attendues.filter((n) => n !== null && citesIds.has(n)).length / attendues.length).toFixed(3)),
      jeNeSaisPas: /je ne sais pas|i don.t know/i.test(rendu.slice(0, 200)),
    },
    usage,
    latenceMs: latence,
    fournisseur,
    trace,
  };
}
