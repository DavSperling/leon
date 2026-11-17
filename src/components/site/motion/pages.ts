import { $$, dur, type Env, ease, flagPop, gsap, later, rise, ScrollTrigger, seen } from './core';

// Le mouvement des pages intérieures (produit, cas d'usage, connecteurs, sécurité, tarifs, documentation), chargé à la
// demande par pages-motion.tsx. Le haut de chaque page arrive en CSS (pages.css) : juste à la première image, sans
// script. Ici, ce qui arrive au défilement, un geste par objet, posé dans le balisage par data-pm :
//   deal    des feuilles distribuées sur le bureau, une à une        land    une feuille qui se pose (data-pm-from)
//   ticks   les coches se tracent et le fait s'encre, au défilement  pops    des numéros ou des logos qui sortent
//   type    les lignes d'un terminal, une à une                      ask     les trois traits, puis la question
//   rise    une liste qui arrive comme une liste                     stamp   le tampon « Privé »
//   case    une situation : la question s'écrit, puis ses sources sortent, numéro après numéro
// et le trait de surligneur des titres (.s-mark hors du haut de page). Ce qui est déjà à l'écran reste tel quel.

type Gesture = (env: Env, el: HTMLElement) => void;

/** Une fois, quand `el` entre : `prepare` cache, `play` joue. Déjà à l'écran : rien. */
function enter(env: Env, el: Element, prepare: () => void, play: () => void, start = 'top 84%') {
  if (seen(el)) return;
  prepare();
  ScrollTrigger.create({ trigger: el, start, once: true, onEnter: later(env, play) });
}

const kids = (el: Element) => $$(':scope > *', el);

const landFrom = (el: Element, i = 0) => {
  const side = el.getAttribute('data-pm-from') === 'left' ? -1 : 1;
  return { opacity: 0, x: side * 56, y: -18, rotate: side * (i % 2 ? 2.2 : 3.4) };
};
const landTo = { opacity: 1, x: 0, y: 0, rotate: 0, duration: dur.slow, ease: ease.out };

const gestures: Record<string, Gesture> = {
  rise: (env, el) => rise(env, el, kids(el)),

  land: (env, el) =>
    enter(
      env,
      el,
      () => gsap.set(el, landFrom(el)),
      () => gsap.to(el, { ...landTo, clearProps: 'transform,opacity' }),
    ),

  deal: (env, el) => {
    const sheets = kids(el);
    enter(
      env,
      el,
      () => sheets.forEach((s, i) => void gsap.set(s, landFrom(el, i))),
      () => gsap.to(sheets, { ...landTo, stagger: 0.09, clearProps: 'transform,opacity' }),
    );
  },

  // Lié au défilement : chaque fait s'encre et sa marque se trace quand sa ligne monte dans la fenêtre
  ticks: (_env, el) => {
    for (const li of kids(el)) {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: li, start: 'top 94%', end: 'top 68%', scrub: 0.4 },
      });
      tl.fromTo(li, { opacity: 0.28 }, { opacity: 1, duration: 1 }, 0);
      const path = li.querySelector('.s-check path:last-child');
      if (path)
        tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7 }, 0.3);
    }
  },

  // Tarifs, « dans chaque offre » : la coche de chaque ligne se trace quand la ligne monte ; le texte, lui, ne bouge pas
  included: (_env, el) => {
    for (const path of $$('.s-check path', el))
      gsap.fromTo(
        path,
        { strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: path.closest('th'),
            start: 'top 92%',
            end: 'top 74%',
            scrub: 0.4,
          },
        },
      );
  },

  pops: (env, el) => {
    const marks = $$('.num, .s-logo', el);
    enter(
      env,
      el,
      () => gsap.set(marks, { scale: 0.6, opacity: 0 }),
      () =>
        gsap.to(marks, {
          scale: 1,
          opacity: 1,
          transformOrigin: '50% 50%',
          duration: dur.base,
          ease: ease.pop,
          stagger: 0.06,
          clearProps: 'transform,transformOrigin,opacity',
        }),
    );
  },

  pop: (env, el) =>
    enter(
      env,
      el,
      () => gsap.set(el, { opacity: 0 }),
      () => void flagPop(el),
    ),

  type: (env, el) => {
    const lines = $$('p', el);
    enter(
      env,
      el,
      () => gsap.set(lines, { opacity: 0 }),
      () =>
        gsap.to(lines, {
          opacity: 1,
          duration: 0.01,
          stagger: 0.11,
          delay: 0.2,
          clearProps: 'opacity',
        }),
      'top 78%',
    );
  },

  ask: (env, el) => {
    const strokes = $$('.strokes i', el);
    const words = el.querySelector('.strokes + *');
    enter(
      env,
      el,
      () => {
        gsap.set(strokes, { scaleX: 0, transformOrigin: '0 50%' });
        if (words) gsap.set(words, { clipPath: 'inset(0 100% 0 0)' });
      },
      () => {
        gsap.to(strokes, {
          scaleX: 1,
          duration: dur.fast,
          ease: 'power1.out',
          stagger: 0.07,
          clearProps: 'transform,transformOrigin',
        });
        if (words)
          gsap.to(words, {
            clipPath: 'inset(0 0% 0 0)',
            duration: dur.slow,
            delay: 0.22,
            ease: 'power1.inOut',
            clearProps: 'clipPath',
          });
      },
      'top 90%',
    );
  },

  // Cas d'usage : la question s'écrit dans son champ, puis ce qui revient s'encre et ses sources sortent une à une
  case: (env, el) => {
    const strokes = $$('.pg-ask .strokes i', el);
    const words = el.querySelector('.pg-ask .strokes + *');
    const back = el.querySelector('.pg-sit__back');
    const srcs = $$('.pg-srcs > li', el);
    enter(
      env,
      el,
      () => {
        gsap.set(strokes, { scaleX: 0, transformOrigin: '0 50%' });
        gsap.set(words, { clipPath: 'inset(0 100% 0 0)' });
        gsap.set(back, { opacity: 0.25 });
        gsap.set(srcs, { scale: 0.6, opacity: 0 });
      },
      () => {
        gsap.to(strokes, {
          scaleX: 1,
          duration: dur.fast,
          ease: 'power1.out',
          stagger: 0.07,
          clearProps: 'transform,transformOrigin',
        });
        gsap.to(words, {
          clipPath: 'inset(0 0% 0 0)',
          duration: 0.7,
          delay: 0.22,
          ease: 'power1.inOut',
          clearProps: 'clipPath',
        });
        gsap.to(back, { opacity: 1, duration: dur.base, delay: 0.8, clearProps: 'opacity' });
        gsap.to(srcs, {
          scale: 1,
          opacity: 1,
          transformOrigin: '0% 50%',
          duration: dur.base,
          ease: ease.pop,
          stagger: 0.09,
          delay: 1,
          clearProps: 'transform,transformOrigin,opacity',
        });
      },
      'top 78%',
    );
  },

  stamp: (env, el) =>
    enter(
      env,
      el,
      () => gsap.set(el, { scale: 1.7, opacity: 0 }),
      () =>
        gsap.to(el, {
          scale: 1,
          opacity: 1,
          duration: 0.24,
          delay: 0.5,
          ease: 'power3.in',
          clearProps: 'transform,opacity',
        }),
    ),
};

export function start(): () => void {
  const html = document.documentElement;
  const undos: Array<() => void> = [];
  const env: Env = {
    ctx: gsap.context(() => {}),
    late: true, // le module arrive après la première image : ce qui est à l'écran n'est jamais caché
    undo: (fn) => undos.push(fn),
    on: (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      undos.push(() => target.removeEventListener(type, fn, opts));
    },
  };
  env.ctx.add(() => {
    for (const el of $$('.s-page [data-pm]')) {
      try {
        gestures[el.dataset.pm ?? '']?.(env, el);
      } catch (err) {
        console.error('[site] mouvement', el.dataset.pm, err); // un geste qui casse n'empêche pas les autres
      }
    }
    // Le trait d'un titre de section se trace quand le titre entre (celui du haut de page est tracé en CSS)
    for (const mark of $$('.s-page .s-mark')) {
      if (mark.closest('.s-top')) continue;
      enter(
        env,
        mark,
        () => gsap.set(mark, { '--sweep': 0 }),
        () =>
          gsap.to(mark, {
            '--sweep': 1,
            duration: dur.base,
            delay: 0.25,
            ease: 'power1.inOut',
            onComplete: () => void mark.style.removeProperty('--sweep'),
          }),
        'top 80%',
      );
    }
  });

  // Les déclencheurs se recalculent quand la page change de hauteur (un filtre, les polices, la bascule de la doc)
  let seenHeight = html.scrollHeight;
  let timer = 0;
  const ro = new ResizeObserver(() => {
    if (html.scrollHeight === seenHeight) return;
    seenHeight = html.scrollHeight;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), 160);
  });
  ro.observe(document.body);

  return () => {
    window.clearTimeout(timer);
    ro.disconnect();
    for (const fn of undos.splice(0).reverse()) fn();
    env.ctx.revert();
    // ScrollTrigger recopie en ligne (à l'image suivante) le défilement doux qu'il lit : il suivrait l'appli
    requestAnimationFrame(() => {
      html.style.removeProperty('scroll-behavior');
      if (!html.getAttribute('style')) html.removeAttribute('style');
    });
  };
}
