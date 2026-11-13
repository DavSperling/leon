import {
  $,
  $$,
  drawMark,
  dur,
  type Env,
  ease,
  flagPop,
  gsap,
  hideMark,
  later,
  rise,
  ScrollTrigger,
  seen,
} from './core';

// Les connecteurs, le point du matin, les développeurs, la sécurité, la fin et le pied (NOTES-motion-ambient.md et, pour
// les développeurs, l'arrivée et le terminal de NOTES-motion-dev.md : l'histoire en trois temps n'est pas dans la vraie
// page). Chaque bloc attend sa propre entrée à l'écran ; 70 ms d'écart dans une rangée (titre, texte, fragment).

const STEP = 0.07;

export function ambient(env: Env) {
  /* ---------- 3. Connecteurs : le titre (et son compte de 0 à 42), le chapeau, le trait ; les rangées qui roulent ---------- */
  const conn = $('[data-home="connectors"]');
  if (conn) {
    const h2 = $('h2[data-rv]', conn);
    const lead = $('p[data-rv]', conn);
    const count = h2 && $('[data-count]', h2);
    const total = Number(count?.dataset.count || 0);
    const markEl = h2 && $('.s-mark', h2);
    rise(env, h2, [h2], {
      start: 'top 88%',
      prepare: () => hideMark(markEl),
      after: (delay) => {
        drawMark(markEl, delay + 0.3);
        const node = count?.firstChild;
        if (!total || !count || !h2 || !node) return;
        // le nombre garde la largeur de « 42 » : les mots qui suivent ne bougent pas ; personne n'entend « 0 connecteurs »
        const em =
          count.getBoundingClientRect().width / parseFloat(getComputedStyle(count).fontSize);
        h2.setAttribute('aria-label', h2.textContent ?? '');
        Object.assign(count.style, {
          display: 'inline-block',
          width: `${em.toFixed(3)}em`,
          textAlign: 'right',
        });
        const done = () => {
          node.nodeValue = String(total);
          count.removeAttribute('style');
          h2.removeAttribute('aria-label');
        };
        env.undo(done);
        node.nodeValue = '0';
        const at = { n: 0 };
        gsap.to(at, {
          n: total,
          duration: dur.count,
          delay,
          ease: ease.out,
          onUpdate: () => {
            node.nodeValue = String(Math.round(at.n));
          },
          onComplete: done,
        });
      },
    });
    rise(env, lead, [lead], { start: 'top 88%', delay: STEP });

    const marquee = $('[data-marquee]', conn);
    // Les fiches sont distribuées sur la table : celles qui sont à l'écran se posent une à une, de gauche à droite,
    // un peu de travers puis droites ; ensuite seulement les rangées les donnent à la pile.
    const slips = marquee ? $$('.s-tool', marquee) : [];
    // La pile de Leon se pose la première (la feuille qui atterrit), puis les fiches lui arrivent des deux côtés
    const pile = marquee && $('[data-inflow-pile]', marquee);
    const intro = Boolean(marquee && slips.length && !(env.late && seen(marquee)));
    let dealtAll = () => {};
    if (marquee && intro) {
      gsap.set(pile ? [...slips, pile] : slips, { opacity: 0 });
      ScrollTrigger.create({
        trigger: marquee,
        start: 'top 90%',
        once: true,
        onEnter: later(env, () => {
          const left = new Map(slips.map((el) => [el, el.getBoundingClientRect().left]));
          const at = (el: HTMLElement) => left.get(el) ?? 0;
          const dealt = slips
            .filter((el) => at(el) > -200 && at(el) < window.innerWidth)
            .sort((x, y) => at(x) - at(y));
          gsap.set(slips, { clearProps: 'opacity' });
          if (pile)
            gsap.fromTo(
              pile,
              { opacity: 0, y: -34, rotate: 5 },
              {
                opacity: 1,
                y: 0,
                rotate: 0,
                duration: dur.slow,
                ease: ease.out,
                clearProps: 'transform,opacity',
              },
            );
          gsap.from(dealt, {
            opacity: 0,
            y: -22,
            rotate: (i) => (i % 2 ? 5 : -4),
            duration: dur.slow,
            ease: ease.out,
            stagger: 0.028,
            delay: 0.18,
            clearProps: 'transform,opacity',
            onComplete: () => dealtAll(),
          });
          if (!dealt.length) dealtAll();
        }),
      });
    }
    // Les fiches sont données à la pile, un battement à la fois : chaque rangée avance d'une fiche (celle de tête passe
    // entière sous la pile), puis tout se repose, longtemps. Au repos, aucun nom n'est coupé par la pile. Sous le
    // pointeur ou le focus, hors de l'écran et pendant l'arrivée, le battement en cours finit et le suivant attend.
    const rows = marquee ? $$('.s-marquee__row', marquee) : [];
    if (marquee && rows.length) {
      const REST = 3.4;
      const hold = { pointer: false, focus: false, away: true, intro };
      const held = () => hold.pointer || hold.focus || hold.away || hold.intro;
      // un côté puis l'autre, à 80 ms d'écart : gauche, droite, gauche, droite
      const lanes = [rows[0], rows[2], rows[1], rows[3]].flatMap((row) =>
        row ? [{ row, tools: $$('.s-tool', row), k: 0, x: 0 }] : [],
      );
      let timer: gsap.core.Tween | null = null;
      let parked = true;
      const beat = () => {
        timer = null;
        if (held()) {
          parked = true;
          return;
        }
        for (const [i, lane] of lanes.entries()) {
          const toRight = lane.row.hasAttribute('data-reverse');
          // la fiche de tête, côté pile : la dernière de la rangée de gauche, la première de celle de droite
          const head = lane.tools[toRight ? lane.tools.length - 1 - lane.k : lane.k];
          if (!head) continue;
          const by =
            head.getBoundingClientRect().width +
            (parseFloat(getComputedStyle(lane.row).columnGap) || 0);
          lane.x += toRight ? by : -by;
          gsap.to(lane.row, {
            x: lane.x,
            duration: 0.7,
            delay: i * 0.08,
            ease: ease.inOut,
            onComplete: () => {
              // les fiches sont écrites deux fois : au bout de la première copie, la rangée reprend à zéro, à l'identique
              if (++lane.k >= lane.tools.length / 2) {
                lane.k = 0;
                lane.x = 0;
                gsap.set(lane.row, { x: 0 });
              }
            },
          });
        }
        timer = gsap.delayedCall(REST + 1, beat);
      };
      const set = (key: keyof typeof hold, on: boolean) => {
        hold[key] = on;
        if (!held() && parked) {
          parked = false;
          timer = gsap.delayedCall(0.6, beat);
        }
      };
      dealtAll = () => set('intro', false);
      env.on(marquee, 'pointerenter', () => set('pointer', true));
      env.on(marquee, 'pointerleave', () => set('pointer', false));
      env.on(marquee, 'pointercancel', () => set('pointer', false));
      env.on(marquee, 'focusin', () => set('focus', true));
      env.on(marquee, 'focusout', () => set('focus', false));
      const io = new IntersectionObserver(
        (entries) => set('away', !entries[entries.length - 1]?.isIntersecting),
        { rootMargin: '120px 0px' },
      );
      io.observe(marquee);
      env.undo(() => {
        io.disconnect();
        timer?.kill();
        gsap.killTweensOf(rows);
        gsap.set(rows, { clearProps: 'transform' });
      });
    }
  }

  /* ---------- 4. Le point du matin : le mémo arrive, ses lignes s'écrivent de la gauche, chaque numéro sort après la sienne ---------- */
  const brief = $('[data-home="briefing"]');
  if (brief) {
    const memo = $('[data-memo]', brief);
    const textBlock = $('div[data-rv]', brief);
    const lines = memo ? $$('.s-memo > p, .s-memo h3, .s-memo li', memo) : [];
    const HIDDEN = 'inset(-20% 100% -20% -2%)';
    rise(env, memo, [memo], {
      start: 'top 74%',
      prepare: () => gsap.set(lines, { clipPath: HIDDEN }),
      after: (delay) => {
        const tl = gsap.timeline({ delay: delay + 0.24 });
        lines.forEach((line, i) => {
          tl.to(
            line,
            {
              clipPath: 'inset(-20% -2% -20% -2%)',
              duration: dur.base,
              ease: ease.inOut,
              clearProps: 'clipPath',
            },
            i * 0.09,
          );
          const pop = flagPop($('.num', line));
          if (pop) tl.add(pop, i * 0.09 + 0.3);
        });
      },
    });
    const markEl = textBlock && $('.s-mark', textBlock);
    rise(env, textBlock, [textBlock], {
      start: 'top 88%',
      delay: STEP,
      prepare: () => hideMark(markEl),
      after: (delay) => drawMark(markEl, delay + 0.3),
    });
  }

  /* ---------- 5. Les développeurs : l'arrivée, puis le terminal s'imprime ligne à ligne (40 ms) et les trois logos sortent ---------- */
  const dev = $('[data-home="developers"]');
  if (dev) {
    const side = $('div[data-rv]', dev);
    const term = $('[data-term]', dev);
    const parts = [
      ...(side ? Array.from(side.children) : []).flatMap((el) =>
        el.matches('ul') ? Array.from(el.children) : [el],
      ),
    ];
    const figure = term ? Array.from(term.children) : [];
    const lines = term ? $$('.s-term__body > p', term) : [];
    // la feuille des originaux : elle sort du terminal quand il a fini d'imprimer, et se pose sur son coin
    const docs = term && $('[data-term-docs]', term);
    rise(env, side ?? term, [...parts, ...figure], {
      prepare: () => gsap.set(docs ? [...lines, docs] : lines, { opacity: 0 }),
      after: (delay) => {
        const tl = gsap.timeline({ delay: delay + STEP * (parts.length + 1) + 0.3 });
        lines.forEach((line, i) => {
          tl.set(line, { opacity: 1, clearProps: 'opacity' }, i * 0.04);
        });
        $$('.s-logo', term ?? dev).forEach((logo, i) => {
          const pop = flagPop(logo);
          if (pop) tl.add(pop, lines.length * 0.04 + 0.1 + i * 0.12);
        });
        if (docs)
          tl.fromTo(
            docs,
            { opacity: 0, x: 56, y: -40, rotate: 7 },
            {
              opacity: 1,
              x: 0,
              y: 0,
              rotate: 1.4,
              duration: dur.slow,
              ease: ease.out,
              clearProps: 'transform,opacity',
            },
            lines.length * 0.04 + 0.46,
          );
      },
    });
  }

  /* ---------- 6. La sécurité : le titre, les listes, puis les trois coches et les trois demi-anneaux se tracent ---------- */
  const sec = $('[data-home="security"]');
  if (sec) {
    const head = $('div[data-rv="1"]', sec);
    const lists = $('[data-checks]', sec);
    const marks = lists ? $$('.s-check path', lists) : [];
    rise(env, head, [head], { start: 'top 88%' });
    rise(env, lists, [lists], {
      start: 'top 88%',
      delay: STEP,
      prepare: () => gsap.set(marks, { strokeDashoffset: 1 }),
      after: (delay) => {
        const tl = gsap.timeline({
          delay: delay + 0.22,
          onComplete: () => void gsap.set(marks, { clearProps: 'strokeDashoffset' }),
        });
        marks.forEach((path, i) => {
          tl.to(path, { strokeDashoffset: 0, duration: dur.base, ease: ease.inOut }, i * STEP);
        });
      },
    });
  }

  /* ---------- 7. La fin : la phrase, le texte, les pastilles ; puis les trois drapeaux sortent du bord de la feuille
     et les trois traits du haut passent sous les derniers mots ; le pied ---------- */
  const close = $('main .s-close');
  if (close) {
    const els = [
      $('.s-close__text > h2', close),
      $('.s-close__text > p', close),
      $('.s-close__cta', close),
    ];
    const flags = $$('.s-end__flags > .flag', close);
    const strokes = $$('.s-swp > i', close);
    rise(env, close, els, {
      start: 'top 88%',
      prepare: () => {
        gsap.set(flags, { opacity: 0 });
        gsap.set(strokes, { clipPath: 'inset(-20% 100% -20% 0)' });
      },
      after: (delay) => {
        const tl = gsap.timeline({ delay: delay + 0.28 });
        flags.forEach((flag, k) => {
          tl.fromTo(
            flag,
            { scale: 0.6, opacity: 0, transformOrigin: '100% 50%' },
            {
              scale: 1,
              opacity: 1,
              duration: dur.base,
              ease: ease.pop,
              clearProps: 'transform,transformOrigin,opacity',
            },
            k * 0.11,
          );
        });
        strokes.forEach((stroke, k) => {
          tl.to(
            stroke,
            {
              clipPath: 'inset(-20% 0% -20% 0)',
              duration: dur.fast,
              ease: 'power1.out',
              clearProps: 'clipPath',
            },
            0.3 + k * 0.16,
          );
        });
      },
    });
  }
  const foot = $('.s-foot__grid');
  if (foot) {
    const els = Array.from(foot.children).flatMap((el) =>
      el.matches('nav') ? Array.from(el.children) : [el],
    );
    rise(env, foot, els, { start: 'top 94%' });
  }
}
