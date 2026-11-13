import { ambient } from './ambient';
import { type Env, gsap, ScrollTrigger } from './core';
import { hero } from './hero';
import { rules } from './rules';

// Le mouvement de l'accueil, chargé à la demande par home-motion.tsx. Renvoie de quoi tout défaire : chaque animation,
// chaque déclencheur, chaque style posé, chaque écouteur (au démontage, à une navigation, à « Arrêter les animations »).

export function start(boot: { at: number; hard: boolean; again: boolean }): () => void {
  const html = document.documentElement;
  const undos: Array<() => void> = [];
  const env: Env = {
    ctx: gsap.context(() => {}),
    // le filet de 1,5 s a déjà tout montré, ou c'est une navigation (rien n'a été caché d'avance)
    late: !boot.hard || performance.now() > 1500,
    undo: (fn) => undos.push(fn),
    on: (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      undos.push(() => target.removeEventListener(type, fn, opts));
    },
  };
  // La main passe : ce qui était caché d'avance l'est maintenant par le script, dans la même tâche (aucune image entre)
  html.classList.remove('js-motion');
  for (const [name, run] of [
    ['hero', () => hero(env, boot)],
    ['rules', () => rules(env)],
    ['ambient', () => ambient(env)],
  ] as const) {
    env.ctx.add(() => {
      try {
        run();
      } catch (err) {
        console.error(`[accueil] mouvement ${name}`, err); // un module qui casse n'empêche pas les autres
      }
    });
  }

  // Les déclencheurs se recalculent quand la page change de hauteur (les règles épinglées l'allongent, les polices arrivent)
  let seenHeight = 0;
  let timer = 0;
  const refresh = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), 160);
  };
  const ro = new ResizeObserver(() => {
    if (html.scrollHeight !== seenHeight) {
      seenHeight = html.scrollHeight;
      refresh();
    }
  });
  ro.observe(document.body);
  window.addEventListener('load', refresh);
  ScrollTrigger.refresh();
  seenHeight = html.scrollHeight;

  return () => {
    window.clearTimeout(timer);
    ro.disconnect();
    window.removeEventListener('load', refresh);
    for (const fn of undos.splice(0).reverse()) {
      try {
        fn();
      } catch (err) {
        console.error('[accueil] mouvement', err);
      }
    }
    env.ctx.revert();
    ScrollTrigger.refresh();
    // ScrollTrigger recopie en ligne (à l'image suivante) le défilement doux qu'il lit : il suivrait l'appli
    requestAnimationFrame(() => {
      html.style.removeProperty('scroll-behavior');
      if (!html.getAttribute('style')) html.removeAttribute('style');
    });
  };
}
