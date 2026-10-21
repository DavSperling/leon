/*
 * Écran Recherche (/). Contrat avec le routeur : export par défaut, sans props ; l'état vit dans l'adresse (?q=, &page=).
 * Une recherche : résultats en moins d'une demi-seconde, puis la réponse de Leon s'écrit au-dessus. Soumettre la même
 * requête la rejoue ; Précédent / Suivant du navigateur ramènent la page telle qu'on l'a laissée, sans la rejouer.
 *
 * Paramètres de démonstration (combinables, avec ?theme=light|dark et ?instant=1 pour l'état final sans animation) :
 *   /                                              accueil : exemples, syntaxe ; « / » ramène à la barre
 *   /?q=où en est le renouvellement du contrat ACME ?   réponse citée en flux, 10 résultats, pagination (2 pages)
 *   /?q=budget  ·  ?q=ovh  ·  ?q=sauvegardes  ·  ?q=sso  ·  ?q=recrutement      autres réponses citées
 *   /?q=outil:github type:ticket                   filtres seuls : puces actives, « Les résultats ne suffisent pas pour répondre. »
 *   /?q=budget outil:slack depuis:2x               puces d'avertissement « Filtre non reconnu : la recherche l’ignore. »
 *   /?q=budget de:julien                           avertissement « Personne ne s’appelle « julien » dans l’équipe. »
 *   /?q=xyzzy                                      vide, page 1 : « Aucun résultat. »
 *   /?q=budget&page=9                              vide, page > 1 : « Il n’y a pas autant de résultats. » + « Revenir à la première page »
 *   &page=2                                        pagination (10 par page, 50 pages au plus)
 *   &etat=erreur                                   « La recherche n’a pas abouti… »
 *   ?etat=plantage                                 l'écran lève une erreur au rendu : page d'erreur du routeur (errorElement)
 *   &reponse=recherche                             recherche figée en cours (cartes fantômes immobiles, « Leon cherche dans la mémoire… », faisceau)
 *   &reponse=attente                               réponse figée en chargement (squelette, « Leon lit N sources… », faisceau)
 *   &reponse=flux                                  réponse figée en plein flux (curseur seul, sans faisceau ni statut ; renvois vivants)
 *   &reponse=insuffisante | indisponible | masquee les résultats ne suffisent pas / réponse indisponible / pas d'encadré (pas de modèle)
 *   &discussion=impossible | erreur                « Continuer en discussion » échoue avec son message
 *   &apercu=3                                      aperçu du résultat 3 ouvert (panneau à droite si la page a 900 px, feuille sinon)
 *   &apercu=chargement | introuvable | erreur      aperçu du résultat 1 figé en chargement / passage introuvable / erreur
 *   &menu=outil | type | periode | personne        menu de filtre ouvert (ou la saisie « Personne »)
 */
import { ArrowLeft, SearchX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router';
import { Button, EmptyState, Notice, PageHeader, Pagination, useThinking } from '@/components';
import { type AnswerState, countLabel, search, type SearchResult } from '@/data';
import { cn, exit, isInstant, nb, scrollToTop, simulateStream, useTitle, wait } from '@/lib';
import { AnswerCard, type DiscussionFailure, NOT_ENOUGH, type Phase } from './answer';
import { type FilterMenuName, Filters } from './filters';
import { riseAt, useAppear } from './motion';
import { type PreviewStatus, PreviewPane, PreviewSheet, type Selection, useWide } from './preview';
import { GhostResults, ResultCard } from './results';
import { SearchBar } from './search-bar';
import { searchHref, unknownPeopleMessage } from './url';
import { Welcome } from './welcome';

type Run = { phase: Phase; text: string };
type Freeze = 'recherche' | 'attente' | 'flux' | 'insuffisante' | 'indisponible' | 'masquee';

// Latence simulée : courte (les résultats arrivent vite, la réponse s'écrit ensuite au rythme du flux).
const SEARCH_MS = 400;
const READ_MS = 600;

const TOKEN = /\[\d+\]|\s+|[^\s[]+|\[/g;
/** Un peu plus de la moitié de la réponse (état figé « en plein flux »). */
const halfway = (t: string) => {
  const tokens = t.match(TOKEN) ?? [];
  return tokens.slice(0, Math.ceil(tokens.length * 0.55)).join('').trimEnd();
};
const oneOf = <T extends string>(v: string | null, values: readonly T[]): T | null => (values.includes(v as T) ? (v as T) : null);
/** L'élément qui avait le focus a disparu (lien de l'accueil, puce, pagination) : le focus est retombé sur <body>. */
const focusLost = () => !document.activeElement || document.activeElement === document.body;

export default function Recherche() {
  // Les entrées de l'écran jouent dans sa propre présence : celle de l'ossature reste figée à initial=false après un chargement.
  return (
    <AnimatePresence>
      <div key="recherche" className="contents">
        <Screen />
      </div>
    </AnimatePresence>
  );
}

function Screen() {
  useTitle('Recherche');
  const appear = useAppear();
  // En sortie de page, l'écran sortant lit encore l'adresse : il garde la sienne (sinon il repasserait à l'accueil et prendrait le focus).
  const [liveParams] = useSearchParams();
  const liveLocation = useLocation();
  const held = useRef({ params: liveParams, location: liveLocation });
  if (liveLocation.pathname === '/') held.current = { params: liveParams, location: liveLocation };
  const { params, location } = held.current;
  const navType = useNavigationType();
  const navigate = useNavigate();
  const bar = useRef<HTMLDivElement>(null);
  const wide = useWide(bar);
  const { setThinking } = useThinking();

  const etat = params.get('etat');
  if (etat === 'plantage') throw new Error('Plantage de démonstration (?etat=plantage).');

  const q = params.get('q') ?? '';
  const searching = q.trim() !== '';
  const page = Math.min(50, Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1));
  const freeze = oneOf<Freeze>(params.get('reponse'), ['recherche', 'attente', 'flux', 'insuffisante', 'indisponible', 'masquee']);
  const apercu = params.get('apercu');
  const forcedPreview = oneOf(apercu, ['chargement', 'introuvable', 'erreur'] as const);
  const openMenu = oneOf<FilterMenuName>(params.get('menu'), ['outil', 'type', 'periode', 'personne']);
  const failure = oneOf<DiscussionFailure>(params.get('discussion'), ['impossible', 'erreur']);
  const failed = etat === 'erreur';

  const force: AnswerState | undefined = freeze === 'insuffisante' ? 'not-enough' : freeze === 'indisponible' ? 'unavailable' : undefined;
  const res = useMemo(() => (searching && !failed ? search(q, { page, force }) : null), [searching, failed, q, page, force]);
  const results = res?.results ?? [];
  const hasAnswer = results.length > 0 && page === 1 && freeze !== 'masquee';
  const kind: AnswerState = res?.answerState ?? 'not-enough';
  const full = kind === 'ok' ? (res?.answer ?? '') : kind === 'not-enough' ? NOT_ENOUGH : '';
  // Leon lit les sources qu'il va citer (ou les trois premières, quand il n'aura rien à en dire)
  const reading = kind === 'ok' ? new Set([...full.matchAll(/\[(\d+)\]/g)].map((m) => m[1])).size : Math.min(3, results.length);

  // ---------- Déroulé : cherche → lit → rédige → fini ----------
  // Précédent / Suivant (POP hors chargement initial) : l'état final tout de suite, sans rejouer la recherche.
  const replay = !(navType === 'POP' && location.key !== 'default');
  const runKey = `${location.key}\u0000${q}\u0000${page}\u0000${freeze}\u0000${etat}`;
  const final = (): Run => {
    if (!searching) return { phase: 'done', text: '' };
    if (freeze === 'recherche') return { phase: 'searching', text: '' };
    if (!hasAnswer) return { phase: 'done', text: '' };
    if (freeze === 'attente') return { phase: 'reading', text: '' };
    if (freeze === 'flux') return { phase: 'writing', text: halfway(full) };
    return { phase: 'done', text: full };
  };
  const [run, setRun] = useState<Run>(() => (searching && replay && !isInstant() ? { phase: 'searching', text: '' } : final()));
  const [sel, setSel] = useState<Selection | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('ready');
  const [lit, setLit] = useState<number | null>(null); // renvoi survolé → son résultat s'éclaire
  const [hovered, setHovered] = useState<number | null>(null); // résultat survolé → ses renvois s'éclairent
  const opener = useRef<HTMLElement | null>(null);
  const pane = useRef<HTMLElement>(null);
  const previewReq = useRef(0);
  const autoOpened = useRef<string | null>(null);

  useLayoutEffect(() => {
    previewReq.current++;
    setSel(null);
    setLit(null);
    setHovered(null);
    if (!searching || !replay || isInstant() || freeze === 'recherche') return setRun(final());
    const ctl = new AbortController();
    const { signal } = ctl;
    setRun({ phase: 'searching', text: '' });
    void (async () => {
      if (!(await wait(SEARCH_MS, signal))) return;
      if (!hasAnswer) return setRun({ phase: 'done', text: '' });
      setRun({ phase: 'reading', text: '' });
      if (freeze === 'attente' || !(await wait(READ_MS, signal))) return;
      if (kind === 'unavailable') return setRun({ phase: 'done', text: '' });
      const target = freeze === 'flux' ? halfway(full) : full;
      setRun({ phase: 'writing', text: '' });
      const end = await simulateStream(target, { signal, onToken: (_, acc) => setRun({ phase: 'writing', text: acc }) });
      if (end === 'done' && freeze !== 'flux') setRun({ phase: 'done', text: target });
    })();
    return () => ctl.abort();
  }, [runKey]); // runKey résume q, page, états forcés et navigation

  const working = searching && run.phase !== 'done';
  useEffect(() => setThinking(working), [working, setThinking]);
  const resultsVisible = searching && run.phase !== 'searching';

  // ---------- Aperçu ----------
  const openPreview = useCallback((r: SearchResult, turn: number, el: HTMLElement | null, focusPane = true) => {
    const id = ++previewReq.current;
    if (el) opener.current = el;
    // la feuille rend le focus à ce qui l'avait à l'ouverture : Safari ne le donne pas au bouton touché, on le pose
    if (el && !wide) el.focus({ preventScroll: true });
    setSel({ r, turn });
    const settled: PreviewStatus = forcedPreview === 'introuvable' ? 'not-found' : forcedPreview === 'erreur' ? 'error' : 'ready';
    if (forcedPreview === 'chargement') setPreviewStatus('loading');
    else if (isInstant()) setPreviewStatus(settled);
    else {
      setPreviewStatus('loading');
      void wait(300).then(() => id === previewReq.current && setPreviewStatus(settled));
    }
    // écran large : le curseur va dans l'aperçu à chaque ouverture (flèches, lecteurs d'écran) ; Échap le rend à l'opener
    if (focusPane && wide) requestAnimationFrame(() => pane.current?.focus({ preventScroll: true }));
  }, [forcedPreview, wide]);

  const close = useCallback(() => {
    previewReq.current++;
    setSel(null);
    const el = opener.current;
    opener.current = null;
    if (wide) requestAnimationFrame(() => el?.isConnected && el.focus({ preventScroll: true })); // la feuille rend le focus seule
  }, [wide]);

  useEffect(() => {
    if (!sel || !wide) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel, wide, close]);

  // ?apercu= : l'aperçu s'ouvre seul quand les résultats arrivent
  useEffect(() => {
    if (!apercu || !resultsVisible || !results.length || autoOpened.current === runKey) return;
    autoOpened.current = runKey;
    const r = results.find((x) => x.n === Number(apercu)) ?? results[0]!;
    openPreview(r, r.passages[0]?.turn ?? 0, null, false);
  }, [apercu, resultsVisible, results, runKey, openPreview]);

  // Renvoi cliqué : l'aperçu s'ouvre sans bouger la réponse (panneau à droite, feuille sur écran étroit). Au clavier, le
  // curseur entre dans le panneau ; à la souris, il reste sur la puce, qui éclaire déjà son résultat.
  const onCite = (n: number, el: HTMLElement, keyboard: boolean) => {
    const r = results[n - 1];
    if (r) openPreview(r, r.passages[0]?.turn ?? 0, el, keyboard);
  };

  // ---------- Accueil ↔ résultats : la barre glisse (FLIP, mesuré dans le panneau qui défile), la page repart du haut ----------
  const title = useRef<HTMLHeadingElement>(null);
  const barTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const prev = barTop.current;
    if (prev !== null) {
      scrollToTop(); // un changement de paramètres ne remonte pas seul : on arrive en haut de l'accueil ou des résultats
      if (searching && focusLost()) title.current?.focus({ preventScroll: true }); // l'exemple cliqué a disparu avec l'accueil
    }
    const top = el.getBoundingClientRect().top + (document.getElementById('contenu')?.scrollTop ?? 0) + window.scrollY;
    barTop.current = top;
    if (prev === null || isInstant() || Math.abs(prev - top) < 2) return;
    el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' });
  }, [searching]);

  // Autre page de résultats : le focus va au titre des résultats (le lien suivi a pu disparaître, la vue est remontée).
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    if (focusLost() || document.activeElement?.closest('nav[aria-label="Pagination"]')) resultsTitle.current?.focus({ preventScroll: true });
  }, [page]);

  const input = useRef<HTMLInputElement>(null);
  const go = useCallback((next: string) => {
    // au doigt : le clavier virtuel se range et le champ montre le début de la requête
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (title.current) title.current.focus({ preventScroll: true });
      else input.current?.blur(); // depuis l'accueil, le focus ira au titre une fois les résultats là
    }
    navigate(searchHref(next));
  }, [navigate]);
  const unknown = res ? unknownPeopleMessage(res.unknownPeople) : null;
  const cites = { results, lit: [lit, hovered, sel?.r.n ?? null], onLit: setLit, onCite };
  const showPane = wide && results.length > 0;

  return (
    <>
      <AnimatePresence mode="popLayout">
        {!searching && (
          <motion.div key="entete" variants={riseAt} custom={0.16} initial={appear} animate="animate" exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: exit }}>
            <PageHeader title="Recherche" subtitle="Retrouver une information dans tout ce que Leon a gardé." className="mb-7" />
          </motion.div>
        )}
      </AnimatePresence>
      {searching && <h1 ref={title} tabIndex={-1} className="sr-only">Recherche</h1>}

      <div ref={bar}>
        <SearchBar query={q} large={!searching} searching={searching && run.phase === 'searching'} working={working && run.phase !== 'writing'} inputRef={input} onSubmit={go} />
      </div>

      {!searching ? <Welcome appear={appear} /> : (
        // les filtres et la suite arrivent une fois la barre presque en place
        <motion.div variants={riseAt} custom={0.14} initial={appear} animate="animate" className="mt-3.5 grid grid-cols-[minmax(0,1fr)] gap-5">
          <Filters q={q} go={go} openMenu={openMenu} />

          {/* la réponse et les résultats forment une colonne ; l'aperçu colle à droite sur large écran */}
          <div className={cn('grid grid-cols-[minmax(0,1fr)] items-start gap-5', showPane && 'grid-cols-[minmax(0,1fr)_380px]')}>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
              {hasAnswer && <AnswerCard q={q} phase={run.phase} kind={kind} text={run.text} full={full} reading={reading} failure={failure} {...cites} />}

              {resultsVisible && unknown && <Notice tone="warning" live="status">{unknown}</Notice>}
              {resultsVisible && failed && (
                <Notice tone="error" live="alert">
                  {nb('La recherche n’a pas abouti. Réessayez dans un instant.')}
                </Notice>
              )}
              {resultsVisible && res && results.length === 0 && (
                <motion.div variants={riseAt} initial={appear} animate="animate">
                  {page === 1 ? (
                    <EmptyState icon={SearchX} title="Aucun résultat." description="Essayez d’autres mots, retirez un filtre, ou cherchez le titre d’un document." />
                  ) : (
                    <EmptyState
                      icon={SearchX}
                      title="Il n’y a pas autant de résultats."
                      description="Cette page est vide : les résultats s’arrêtent avant."
                      action={<Button asChild icon={ArrowLeft}><Link to={searchHref(q)}>Revenir à la première page</Link></Button>}
                    />
                  )}
                </motion.div>
              )}

              {(run.phase === 'searching' || (results.length > 0 && !failed)) && (
                <section aria-labelledby="resultats-titre" className="min-w-0">
                  <h2 id="resultats-titre" ref={resultsTitle} tabIndex={-1} className="sr-only">Résultats</h2>
                  {resultsVisible && res && <p role="status" className="mb-3 text-meta tabular-nums text-muted">{countLabel(res.total)}</p>}
                  {!resultsVisible ? <GhostResults /> : (
                    <>
                      <ol className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
                        {results.map((r, i) => (
                          <ResultCard
                            key={`${runKey}\u0000${r.id}`}
                            r={r}
                            i={i}
                            appear={appear}
                            lit={lit === r.n}
                            selected={sel?.r.n === r.n}
                            selectedTurn={sel?.r.n === r.n ? sel.turn : null}
                            onOpen={openPreview}
                            onHover={setHovered}
                          />
                        ))}
                      </ol>
                      {res && res.pages > 1 && <Pagination className="mt-6" page={page} pages={Math.min(res.pages, 50)} href={(p) => searchHref(q, p)} />}
                    </>
                  )}
                </section>
              )}
            </div>
            {showPane && <PreviewPane ref={pane} sel={sel} status={previewStatus} onClose={close} />}
          </div>
          {!wide && <PreviewSheet sel={sel} status={previewStatus} onClose={close} />}
        </motion.div>
      )}
    </>
  );
}
