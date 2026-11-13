import { $, $$, type Env, ease, gsap, later } from './core';
import { motionHooks, type Pace } from './hooks';

// Le haut (NOTES-motion-hero.md). L'arrivée et la réponse qui s'écrit sont en CSS (motion.css), dès la première image ;
// ici : un clic ou une touche pendant l'arrivée la termine ; une autre question fait partir la réponse (200 ms) avant
// de la réécrire plus posément ; choisir une source sort son original de la pile et le pose dessus. L'état reste aux
// composants (HeroTabs, DemoScene) : on joue autour de leur `commit`.

const LOAD = 2700; // la fin de l'arrivée, depuis la première image (ms)
const CALM = 2400; // la fin d'une réponse réécrite, depuis son commit

export function hero(env: Env, boot: { at: number; hard: boolean; again: boolean }) {
  const top = $('.s-hero');
  if (!top) return;
  const scene = () => $('[data-stage]', top);
  const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
  let loading = boot.again ? 0 : (boot.hard ? paint : boot.at) + LOAD; // jusqu'à quand l'arrivée du chargement joue
  let replay = 0; // jusqu'à quand une réponse réécrite joue
  let cutAt = 0;
  let askedAt = 0;
  let leaving: gsap.core.Timeline | null = null;
  let moving: gsap.core.Timeline | null = null;

  /** Tout à sa place, d'un coup : l'arrivée du chargement, ou la réponse qui se réécrit. */
  const finish = () => {
    const now = performance.now();
    if (now < loading) {
      loading = 0;
      cutAt = now;
      top.setAttribute('data-end', '');
      scene()?.setAttribute('data-end', '');
    } else if (now < replay) {
      replay = 0;
      cutAt = now;
      scene()?.setAttribute('data-end', '');
    }
  };
  env.on(document, 'pointerdown', finish, { capture: true });
  env.on(document, 'keydown', finish, { capture: true });
  const s = scene();
  if (s && window.scrollY > s.getBoundingClientRect().bottom + window.scrollY) finish(); // rechargée plus bas

  const endMove = () => moving?.progress(1);

  // Une autre question : la réponse et les originaux partent ensemble (200 ms), puis la nouvelle s'écrit (700 ms
  // d'une phrase à l'autre). Une autre question pendant ce temps : la dernière demandée arrive, déjà écrite.
  motionHooks.scenario = later(env, (commit: (pace: Pace) => void, same: boolean) => {
    const now = performance.now();
    if (same) {
      if (leaving) leaving.revert();
      leaving = null;
      return;
    }
    if (leaving || now - cutAt < 500 || now - askedAt < 400) {
      leaving?.kill();
      leaving = null;
      askedAt = now;
      finish();
      endMove();
      commit('end');
      return;
    }
    askedAt = now;
    finish();
    endMove();
    const sc = scene();
    const sheet = sc && $('.s-sheet', sc);
    if (!sc || !sheet) return commit('calm');
    leaving = gsap
      .timeline({
        onComplete: () => {
          leaving = null;
          commit('calm');
          replay = performance.now() + CALM;
        },
      })
      .to(sheet.children, { opacity: 0, y: -8, duration: 0.2, ease: ease.inOut }, 0)
      // les originaux portent une transition CSS sur l'opacité : coupée ici, sinon ils traînent après la réponse
      .set($$('.s-pile > .doc', sc), { transition: 'none' }, 0)
      .to($$('.s-pile > .doc', sc), { opacity: 0, x: 48, duration: 0.2, ease: ease.inOut }, 0);
  });

  // Choisir une source : son original est tiré de 14 % vers la droite (200 ms) pendant que la pile garde son ordre,
  // puis passe par-dessus les autres et se pose (420 ms) ; les feuilles changent de place en 600 ms (motion.css).
  motionHooks.select = later(env, (n: number, commit: () => void) => {
    finish();
    endMove();
    const pile = scene() && $('.s-pile', scene() as HTMLElement);
    const up = pile && $(`.doc[data-n="${n}"]`, pile);
    if (!pile || !up || !pile.offsetParent || up.dataset.slot === '0') return commit();
    const docs = $$('.doc', pile);
    for (const d of docs) d.dataset.was = d.dataset.slot;
    pile.dataset.moving = '';
    const over = () => {
      for (const d of docs) delete d.dataset.was;
    };
    commit();
    moving = gsap
      .timeline({
        onComplete: () => {
          over();
          delete pile.dataset.moving;
          up.style.removeProperty('--pull');
          moving = null;
        },
      })
      .fromTo(up, { '--pull': 0 }, { '--pull': 14, duration: 0.2, ease: ease.inOut }, 0)
      .call(over, [], 0.2)
      .to(up, { '--pull': 0, duration: 0.42, ease: ease.out }, 0.2)
      .set({}, {}, 0.6);
  });

  env.undo(() => {
    leaving?.kill();
    endMove();
    delete motionHooks.scenario;
    delete motionHooks.select;
  });
}
