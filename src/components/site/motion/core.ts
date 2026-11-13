import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Le langage du mouvement (porté de papier/js/motion/core.js) : trois durées, trois courbes, trois gestes, et l'arrivée
// d'un élément quand il entre à l'écran. Chaque module reçoit un Env : tout ce qu'il crée passe par env.ctx (défait d'un
// coup par revert) ou par env.undo (ce que GSAP ne sait pas défaire : attributs, écouteurs, styles posés à la main).

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ duration: 0.42, ease: 'expo.out' });

export { gsap, ScrollTrigger };
export const dur = { fast: 0.2, base: 0.42, slow: 0.6, count: 0.8 };
export const ease = { out: 'expo.out', inOut: 'power2.inOut', pop: 'back.out(1.8)' };

export type Env = {
  ctx: gsap.Context;
  /** Démarré après le filet de 1,5 s (ou après une navigation) : ce qui est déjà à l'écran reste tel quel. */
  late: boolean;
  undo: (fn: () => void) => void;
  on: (
    target: EventTarget,
    type: string,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ) => void;
};

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

/** Déjà entré à l'écran (ou au-dessus). */
export const seen = (el: Element) => el.getBoundingClientRect().top < window.innerHeight;

/** Un appel différé (un déclencheur, un clic) dont les animations doivent être défaites avec le reste. */
export const later =
  <A extends unknown[]>(env: Env, fn: (...a: A) => void) =>
  (...a: A) =>
    env.ctx.add(() => fn(...a));

/** « Lié » : le numéro (ou le drapeau) sort de son bord, 0,6 → 1, avec le petit dépassement des drapeaux. */
export const flagPop = (el: Element | null) =>
  el
    ? gsap.fromTo(
        el,
        { scale: 0.6, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          transformOrigin: '0% 50%',
          duration: dur.base,
          ease: ease.pop,
          clearProps: 'transform,transformOrigin,opacity',
        },
      )
    : null;

/** Le trait d'un titre se trace de la gauche (--sweep, motion.css) ; il est caché jusque-là. */
export const hideMark = (el: Element | null) => {
  if (el) gsap.set(el, { '--sweep': 0 });
};
export const drawMark = (el: Element | null, delay = 0) =>
  el
    ? gsap.to(el, {
        '--sweep': 1,
        duration: dur.base,
        delay,
        ease: 'power1.inOut',
        onComplete: () => void (el as HTMLElement).style.removeProperty('--sweep'),
      })
    : null;

/** L'arrivée, une fois : 20 px et l'opacité, 600 ms, 70 ms d'écart, quand `trigger` entre (start). `after(delay)` joue
 *  ce qui suit dedans. Démarré tard et déjà à l'écran : rien ne se cache, rien ne se rejoue. */
export function rise(
  env: Env,
  trigger: Element | null,
  els: Array<Element | null>,
  o: { start?: string; delay?: number; after?: (delay: number) => void; prepare?: () => void } = {},
) {
  const list = els.filter((e): e is Element => !!e);
  if (!trigger || !list.length) return;
  if (env.late && seen(trigger)) return;
  gsap.set(list, { opacity: 0, y: 20 });
  o.prepare?.();
  ScrollTrigger.create({
    trigger,
    start: o.start ?? 'top 82%',
    once: true,
    onEnter: later(env, () => {
      const delay = o.delay ?? 0;
      gsap.to(list, {
        opacity: 1,
        y: 0,
        duration: dur.slow,
        ease: ease.out,
        stagger: 0.07,
        delay,
        clearProps: 'transform,opacity',
      });
      o.after?.(delay);
    }),
  });
}
