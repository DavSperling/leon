import { ANSWER_NOT_ENOUGH, type AnswerEvent } from '@/lib/answer-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { type Llm, LlmError } from '@/server/llm/llm';
import { logError } from '@/server/log';
import { searchPassages } from '@/server/search/search';
import type { SearchPage } from '@/server/search/types';
import { buildAnswerPrompt } from './answer-prompt';
import { readPassageTexts } from './passage-texts';

export type { AnswerEvent } from '@/lib/answer-events';

// La réponse en tête (T10) : la recherche de la page, sous les droits du lecteur, puis quelques phrases du modèle
// qui renvoient aux résultats par leur numéro, en flux. Elle ne retarde jamais les résultats : la page les
// affiche d'abord, l'encadré lit ce flux ensuite (route de session-routes.ts).
//
// La page et la route font chacune leur recherche, et le classement peut changer entre les deux (une source
// ingérée entre-temps, le fournisseur de vecteurs lent d'un seul côté). L'encadré donne donc la liste des
// résultats affichés (`resultIds`) : la numérotation la suit, et seuls ces résultats, retrouvés par la recherche
// de la route sous les droits du lecteur, donnent des passages au modèle.
//
// Une panne (recherche, modèle, délai dépassé) rend l'évènement « indisponible », qui termine le flux : le texte
// déjà rendu ne vaut plus rien. Elle ne se journalise que par logError, sans requête, passage ni réponse.

// Contraintes globales du plan : délai de 15 s, cache de 10 min par (utilisateur, requête normalisée).
export const ANSWER_TIMEOUT_MS = 15_000;
export const ANSWER_CACHE_MS = 10 * 60 * 1000;
// Réponses gardées par ce processus au plus : la plus ancienne part d'abord.
const ANSWER_CACHE_MAX = 1000;
// Borne le texte ET la réflexion du modèle (llm.ts) : 120 mots en prennent environ 250, la réflexion de
// l'effort « low » quelques centaines. De la marge, pour ne jamais couper une réponse avant son premier mot.
const ANSWER_MAX_TOKENS = 1500;

// Une réponse gardée vaut pour les mêmes passages : si la recherche ne rend plus les mêmes (une source devenue
// invisible, une donnée nouvelle), le modèle est rappelé au lieu de resservir un texte qui citerait l'ancienne.
type Cached = { passages: string; text: string; at: number };
const cache = new Map<string, Cached>();

function normalizeQuery(query: string): string {
  return query.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

function cacheKey(ctx: TenantContext, query: string): string {
  return [ctx.tenantId, ctx.userId, normalizeQuery(query)].join('\u0000');
}

function readCache(key: string, passages: string, now: number): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.at >= ANSWER_CACHE_MS || now < entry.at) {
    cache.delete(key);
    return null;
  }
  return entry.passages === passages ? entry.text : null;
}

function writeCache(key: string, entry: Cached): void {
  cache.delete(key);
  if (cache.size >= ANSWER_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, entry);
}

// Un renvoi « [2] » ou une liste « [1, 3] ». Seuls les numéros fournis au modèle restent, un par crochet ; un
// renvoi qui n'en garde aucun disparaît avec l'espace qui le précède.
const REFERENCE = /( ?)\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;
// Le début d'un renvoi en fin de morceau : on le garde jusqu'au morceau suivant pour le lire en entier.
const PARTIAL_REFERENCE = / ?\[[\d,;\s]{0,40}$/;

function createReferenceFilter(allowed: ReadonlySet<number>) {
  let pending = '';
  const clean = (text: string) =>
    text.replace(REFERENCE, (_match, space: string, list: string) => {
      const kept = [...new Set(list.split(/[,;]/).map((n) => Number(n.trim())))].filter((n) =>
        allowed.has(n),
      );
      return kept.length === 0 ? '' : `${space}${kept.map((n) => `[${n}]`).join('')}`;
    });
  return {
    push(delta: string): string {
      const text = pending + delta;
      const partial = PARTIAL_REFERENCE.exec(text);
      pending = partial ? partial[0] : '';
      return clean(partial ? text.slice(0, partial.index) : text);
    },
    flush(): string {
      const rest = clean(pending);
      pending = '';
      return rest;
    },
  };
}

export type AnswerInput = { query: string; resultIds: readonly string[] };

export function answerStream(
  ctx: TenantContext,
  input: AnswerInput,
  deps: { llm: Llm | null; embedder: Embedder | null; now?: Date },
): AsyncIterable<AnswerEvent> | null {
  const { llm } = deps;
  if (llm === null) return null;
  return streamAnswer(ctx, input, llm, deps);
}

// La première page de la recherche, et le texte entier des passages de ses résultats affichés sur la page.
async function gather(
  ctx: TenantContext,
  input: AnswerInput,
  deps: { embedder: Embedder | null; now: Date },
): Promise<{ page: SearchPage; texts: Map<string, string> }> {
  const page = await searchPassages(ctx, {
    query: input.query,
    page: 1,
    embedder: deps.embedder,
    now: deps.now,
  });
  const shown = new Set(input.resultIds);
  const passageIds = page.hits
    .filter((hit) => shown.has(hit.sourceId))
    .flatMap((hit) => hit.passages.map((passage) => passage.passageId));
  return { page, texts: await readPassageTexts(ctx, passageIds) };
}

async function* streamAnswer(
  ctx: TenantContext,
  input: AnswerInput,
  llm: Llm,
  deps: { embedder: Embedder | null; now?: Date },
): AsyncGenerator<AnswerEvent> {
  const { query } = input;
  const now = deps.now ?? new Date();
  // Le délai couvre la recherche et le modèle. Il interrompt l'appel au modèle (signal), et la lecture n'attend
  // plus rien après lui, même d'un modèle qui ignorerait le signal. Le lecteur qui s'en va l'interrompt aussi.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new LlmError('délai dépassé')), {
      once: true,
    });
  });
  // Après la fin normale, l'abandon du finally rejette ce délai : personne ne l'attend plus.
  deadline.catch(() => undefined);
  let reading: AsyncIterator<string> | null = null;
  try {
    let found: Awaited<ReturnType<typeof gather>>;
    try {
      found = await Promise.race([gather(ctx, input, { embedder: deps.embedder, now }), deadline]);
    } catch (error) {
      logError('answer.indisponible', error, { etape: 'recherche' });
      yield { type: 'indisponible' };
      return;
    }

    const prompt = buildAnswerPrompt(query, {
      resultIds: input.resultIds,
      hits: found.page.hits,
      texts: found.texts,
    });
    if (prompt.numbered.length === 0) {
      yield { type: 'texte', delta: ANSWER_NOT_ENOUGH };
      yield { type: 'fin' };
      return;
    }
    const key = cacheKey(ctx, query);
    const passages = prompt.numbered.map((entry) => `${entry.n}:${entry.passageId}`).join(',');
    const cached = readCache(key, passages, now.getTime());
    if (cached !== null) {
      yield { type: 'texte', delta: cached };
      yield { type: 'fin' };
      return;
    }

    const filter = createReferenceFilter(new Set(prompt.numbered.map((entry) => entry.n)));
    let text = '';
    try {
      reading = llm
        .streamText({
          step: 'reponse',
          system: prompt.system,
          messages: prompt.messages,
          maxTokens: ANSWER_MAX_TOKENS,
          signal: controller.signal,
        })
        [Symbol.asyncIterator]();
      for (;;) {
        const step = await Promise.race([reading.next(), deadline]);
        if (step.done) break;
        const delta = filter.push(step.value);
        if (delta === '') continue;
        text += delta;
        yield { type: 'texte', delta };
      }
    } catch (error) {
      logError('answer.indisponible', error, { etape: 'modele' });
      yield { type: 'indisponible' };
      return;
    }
    const rest = filter.flush();
    if (rest !== '') {
      text += rest;
      yield { type: 'texte', delta: rest };
    }
    writeCache(key, { passages, text, at: now.getTime() });
    yield { type: 'fin' };
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Le modèle n'est plus lu (fin, panne, délai ou lecteur parti) : on ferme son flux, sans attendre.
    reading?.return?.().catch(() => undefined);
  }
}
