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
} from './core';
import { motionHooks } from './hooks';

// Les trois règles (NOTES-motion-rules.md). Sur grand écran, quand une règle tient sous la barre : la section reste à
// l'écran (sticky) le temps de min(2000, 2,2 × la hauteur) px de défilement, et une ligne de temps de 30 unités, 10 par
// règle, suit la barre de défilement :
//   règle 1   0,4 → 6,7   chaque phrase : son trait balayé, son numéro qui sort, la ligne de sa source qui se pose
//   passage   9,4 → 11,7  la feuille part, le repère descend, le texte change, la réponse suivante arrive
//   règle 2   12 → 13,8   le drapeau vide se dessine à côté de « je ne sais pas » ; 14,2 → 16,3 le premier devis
//   passage   19,2 → 21,7 puis la bascule et la vue de Julie ; 21,6 « Privé » se tamponne (une fois)
//             25          la bascule passe à Sophie d'elle-même (en remontant : Julie)
// Ailleurs (plus étroit, une règle trop haute) : les blocs empilés, avec leur arrivée seulement.

const T = 30;
const CUT = [0, 10, 19.8]; // à partir de CUT[k], la règle k + 1 est celle à l'écran
const REST = [8, 17.6, 23.2]; // chaque règle au repos : où mènent les noms de la liste
const STAMP = 21.6;
const SOPHIE = 25;
const MARKER = 32;

// lu dans l'attribut (le contrat css-variables réserve la lecture par propriété aux couleurs du thème)
const kOf = (el: Element) => Number(/--k:\s*(\d+)/.exec(el.getAttribute('style') ?? '')?.[1] ?? 0);

export function rules(env: Env) {
  const section = $('[data-rules]');
  const wrap = section && $(':scope > .s-wrap', section);
  const list = section && $('[data-rules-list]', section);
  const marker = section && $('[data-rules-marker]', section);
  if (!section || !wrap || !list || !marker) return;
  const rule = (k: number) => $(`[data-rule="${k}"]`, section) as HTMLElement;
  const text = (k: number) => $('[data-rule-text]', rule(k)) as HTMLElement;
  const frag = (k: number) => $('[data-rule-frag]', rule(k)) as HTMLElement;
  const markOf = (k: number) => $('.s-mark', rule(k));
  const body = () => $('[aria-live]', frag(3));
  const links = $$('[data-rule-link]', list);
  const wide = window.matchMedia('(min-width: 1024px)');

  let ctx: gsap.Context | null = null;
  let st: ScrollTrigger | null = null;
  let current = 0;
  let wanted = 0;
  let stamped = false;
  let entered = false;
  const drawn: Record<number, boolean> = {};
  const mark = (k: number, delay: number) => {
    if (drawn[k]) return;
    drawn[k] = true;
    drawMark(markOf(k), delay);
  };

  /* ---------- Les gestes, menés par le défilement (keep : la ligne de temps rejoue à l'envers) ---------- */
  const sentence = (f: HTMLElement, s: number) =>
    $$('.s-answer__text > *', f).filter((el) => kOf(el) === s);
  const cite = (tl: gsap.core.Timeline, f: HTMLElement, s: number, at: number) => {
    const parts = sentence(f, s);
    const marks = parts.filter((el) => el.matches('.hl'));
    const num = parts.map((el) => $('.cite', el)).find(Boolean);
    const n = Number(num?.textContent?.match(/\d+/)?.[0] ?? 0);
    if (marks.length) tl.fromTo(marks, { '--sweep': 0 }, { '--sweep': 1, duration: 1.4 }, at);
    // posé sur le bloc insécable du numéro : le point qui le suit arrive avec lui, il ne flotte plus seul
    if (num)
      tl.fromTo(
        num.parentElement,
        { '--pop': 0 },
        { '--pop': 1, duration: 0.8, ease: ease.pop },
        at + 1.1,
      );
    const row = n ? $$('.s-sheet ol > li', f)[n - 1] : null;
    if (row)
      tl.fromTo(row, { '--land': 0 }, { '--land': 1, duration: 1.6, ease: ease.out }, at + 0.5);
  };
  const turn = (tl: gsap.core.Timeline, k: number, at: number) => {
    const leaving = k === 3 ? [] : $$(':scope > :not(figcaption)', frag(k));
    tl.to(leaving, { opacity: 0, y: -16, duration: 0.7 }, at)
      .to(text(k), { opacity: 0, y: -12, duration: 0.6 }, at + 0.2)
      .to(marker, { y: MARKER * k, duration: 0.9, ease: ease.inOut }, at + 0.4)
      .fromTo(text(k + 1), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7 }, at + 0.8);
  };
  const land = (el: Element | null) =>
    el
      ? gsap.fromTo(
          el,
          { x: 64, y: -20, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 1.4, ease: ease.out },
        )
      : null;
  const stamp = () => {
    const el = $('.s-stamp', body() ?? document.createElement('div'));
    if (el)
      gsap.fromTo(
        el,
        { '--stamp': 0 },
        {
          '--stamp': 1,
          duration: dur.base,
          ease: ease.out,
          onComplete: () => void el.style.removeProperty('--stamp'),
        },
      );
  };

  /* ---------- Ce qui suit la position sans être mené par elle ---------- */
  const setCurrent = (k: number) => {
    if (k === current) return;
    current = k;
    section.dataset.current = String(k);
    for (const i of [1, 2, 3]) rule(i).inert = !!st && i !== k; // hors écran : hors du clavier et de la lecture
    for (const a of links) {
      if (Number(a.dataset.ruleLink) === k) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    if (entered) mark(k, dur.fast);
  };
  let pre: gsap.core.Timeline | null = null;
  let post: gsap.core.Timeline | null = null;
  const flush = () => {
    pre?.progress(1);
    post?.progress(1);
  };
  const track = later(env, (t: number) => {
    setCurrent(t < (CUT[1] ?? 10) ? 1 : t < (CUT[2] ?? 19.8) ? 2 : 3);
    if (!stamped && t >= STAMP) {
      stamped = true;
      if ((motionHooks.viewIndex?.() ?? 0) === 0) stamp();
    }
    const want = t >= SOPHIE ? 1 : 0;
    if (want !== wanted) {
      // seulement quand le seuil est franchi : un clic sur la bascule tient jusque-là
      wanted = want;
      flush();
      motionHooks.showView?.(want);
    }
  });
  const go = (k: number) => {
    if (!st) return;
    window.scrollTo({ top: Math.round(st.start + ((st.end - st.start) * (REST[k - 1] ?? 0)) / T) });
  };

  /* ---------- Julie / Sophie : le changement de personne, joué autour du commit de RightsSwitch ---------- */
  const arrive = (toSophie: boolean, from: DOMRect | null, shared: string) => {
    const b = body();
    if (!b) return;
    post = gsap.timeline({
      onComplete: () => {
        post = null;
      },
    });
    post.fromTo(
      $('.s-answer__text', b),
      { opacity: 0 },
      { opacity: 1, duration: dur.fast, ease: ease.inOut, clearProps: 'opacity' },
      0,
    );
    const ks = [...new Set($$('.s-answer__text > .hl', b).map(kOf))];
    ks.forEach((s, i) => {
      const parts = $$('.s-answer__text > *', b).filter((el) => kOf(el) === s);
      post?.fromTo(
        parts.filter((el) => el.matches('.hl')),
        { '--sweep': 0 },
        { '--sweep': 1, duration: dur.base, ease: ease.inOut, clearProps: '--sweep' },
        i * dur.fast,
      );
      const num = parts.map((el) => $('.cite', el)).find(Boolean);
      const pop = flagPop(num ?? null);
      if (pop) post?.add(pop, i * dur.fast + dur.fast);
    });
    // Le ticket que les deux peuvent ouvrir reste sur le bureau : il glisse de son ancienne place à la nouvelle
    const ticket = $$('.s-sheet ol > li', b).find((li) => li.textContent?.includes(shared));
    if (ticket && from) {
      const to = ticket.getBoundingClientRect();
      post.fromTo(
        ticket,
        { y: from.top - to.top },
        { y: 0, duration: dur.base, ease: ease.out, clearProps: 'transform' },
        0,
      );
    }
    if (!toSophie) {
      const email = $$('.s-sheet ol > li', b).find((li) => $('.s-stamp', li));
      if (email)
        post.fromTo(
          email,
          { '--land': 0 },
          { '--land': 1, duration: dur.slow, ease: ease.out },
          dur.fast,
        );
      const seal = email && $('.s-stamp', email);
      if (seal)
        post.fromTo(
          seal,
          { '--stamp': 0 },
          { '--stamp': 1, duration: dur.base, ease: ease.out },
          dur.fast + dur.base,
        );
    }
  };
  motionHooks.view = later(env, (i: number, commit: () => void) => {
    if (!st) return commit();
    flush();
    const b = body();
    if (!b) return commit();
    const toSophie = i === 1;
    const rows = $$('.s-sheet ol > li', b);
    const email = rows.find((li) => $('.s-stamp', li));
    const ticket = rows.find((li) => li !== email) ?? null;
    const from = ticket?.getBoundingClientRect() ?? null;
    const shared = $('.s-note__t', ticket ?? document.createElement('div'))?.textContent ?? '';
    pre = gsap.timeline({
      onComplete: () => {
        pre = null;
        commit(); // la réponse de Sophie ne contient jamais le mail de Julie
        arrive(toSophie, from, shared);
      },
    });
    // Le mail privé quitte le bureau ; la réponse écrite d'après lui part avec
    if (toSophie && email)
      pre.to(email, { x: 96, rotation: 4, opacity: 0, duration: dur.base, ease: ease.inOut }, 0);
    pre.to(
      $('.s-answer__text', b),
      { opacity: 0, duration: dur.fast, ease: ease.inOut },
      toSophie ? dur.base - dur.fast : 0,
    );
  });
  // Un clic pendant un changement le termine d'abord
  const sw = $('.s-switch', frag(3));
  if (sw) env.on(sw, 'click', flush, { capture: true });

  /* ---------- La version épinglée ---------- */
  const build = () => {
    if (!wide.matches) return false;
    section.classList.add('is-pinned');
    // mesuré ici, une fois ; rien n'est mesuré pendant le défilement
    const navH = $('.s-nav')?.offsetHeight ?? 72;
    const room = window.innerHeight - navH;
    const textH = Math.max(...[1, 2, 3].map((k) => text(k).offsetHeight));
    const h = wrap.offsetHeight;
    if (h + 32 > room) {
      section.classList.remove('is-pinned');
      return false;
    }
    const cs = getComputedStyle(section);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const distance = Math.min(2000, Math.round(window.innerHeight * 2.2));
    const top = Math.round(navH + (room - h) / 2); // la règle au milieu de la place sous la barre
    section.style.setProperty('--rules-top', `${Math.max(0, Math.round((h - textH) / 2))}px`);
    section.style.minHeight = `${pt + h + distance + pb}px`;
    wrap.style.minHeight = `${h}px`; // la vue plus courte de Sophie ne rétrécit pas le panneau
    wrap.style.position = 'sticky';
    wrap.style.top = `${top}px`;

    ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: `top ${top - pt}px`,
          end: `+=${distance}`,
          scrub: dur.base, // sans défilement doux, le défilement est rattrapé en 0,42 s
          refreshPriority: 1,
          onUpdate: (self) => track(self.progress * T),
        },
      });
      st = tl.scrollTrigger ?? null;
      cite(tl, frag(1), 0, 0.4);
      cite(tl, frag(1), 1, 2.5);
      cite(tl, frag(1), 2, 4.6);
      turn(tl, 1, 9.4);
      const sheet2 = $('.s-sheet', frag(2));
      const l2 = land(sheet2);
      if (l2) tl.add(l2, 10.3);
      // Le drapeau vide se dessine autour de son contour, puis « sans source »
      const flag = $('.s-empty-flag polygon', frag(2));
      if (flag)
        tl.fromTo(
          flag,
          { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.8 },
          12,
        );
      tl.fromTo(
        [$('.s-empty-flag path', frag(2)), $('[data-flag-label]', frag(2))],
        { opacity: 0 },
        { opacity: 1, duration: 0.54 },
        13.26,
      );
      cite(tl, frag(2), 0, 14.2);
      turn(tl, 2, 19.2);
      tl.fromTo(
        $('.s-switch', frag(3)),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.7 },
        20.1,
      );
      const l3 = land(body());
      if (l3) tl.add(l3, 20.3);
      tl.set({}, {}, T);
      const seal =
        !stamped && (motionHooks.viewIndex?.() ?? 0) === 0 && $('.s-stamp', body() ?? section);
      if (seal) gsap.set(seal, { '--stamp': 0 });
    });
    wanted = motionHooks.viewIndex?.() ?? 0;
    setCurrent(1);
    return true;
  };
  const teardown = () => {
    flush();
    for (const i of [1, 2, 3]) rule(i).inert = false;
    ctx?.revert(); // la ligne de temps, son déclencheur, et chaque style qu'elle a posé
    ctx = null;
    st = null;
    current = 0;
    section.classList.remove('is-pinned');
    section.removeAttribute('data-current');
    section.style.removeProperty('--rules-top');
    section.style.minHeight = '';
    Object.assign(wrap.style, { minHeight: '', position: '', top: '' });
    for (const el of $$('.hl, .cite, .s-answer__text > span, li, .s-stamp', section))
      for (const p of ['--sweep', '--pop', '--land', '--stamp']) el.style.removeProperty(p);
    for (const a of links) a.removeAttribute('aria-current');
  };

  /* ---------- Le départ : la mise en page, puis l'arrivée (titre, texte, fragment : 70 ms d'écart, une fois) ---------- */
  let pinned = build();
  const heads = (k: number) => [$('.s-h2', text(k)), $('.s-lead', text(k))];
  const all = [list, ...[1, 2, 3].flatMap((k) => [...heads(k), frag(k)])];
  if (pinned) {
    for (const k of [1, 2, 3]) hideMark(markOf(k));
    rise(env, section, [list, ...heads(1), frag(1)], {
      after: () => {
        entered = true;
        mark(current || 1, dur.base);
      },
    });
    if (env.late && section.getBoundingClientRect().top < window.innerHeight) {
      entered = true;
      for (const k of [1, 2, 3]) mark(k, 0);
    }
  } else {
    for (const k of [1, 2, 3]) {
      const before = env.late && rule(k).getBoundingClientRect().top < window.innerHeight;
      if (!before) hideMark(markOf(k));
      rise(env, rule(k), [...heads(k), frag(k)], { after: () => mark(k, dur.base) });
    }
  }

  // Les noms de la liste mènent à leur règle au repos ; un contrôle d'une règle hors écran qui prend le focus l'y ramène
  env.on(list, 'click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('[data-rule-link]');
    if (!a || !st) return;
    e.preventDefault();
    go(Number(a.dataset.ruleLink));
  });
  env.on(section, 'focusin', (e) => {
    const r = st && (e.target as Element).closest<HTMLElement>('[data-rule]');
    if (r && Number(r.dataset.rule) !== current) go(Number(r.dataset.rule));
  });

  // Une autre taille, des polices en retard : tout est défait, mesuré et reconstruit
  const rebuild = later(env, () => {
    const was = pinned;
    teardown();
    pinned = build();
    if (pinned !== was) {
      // une autre mise en page : rien ne reste caché derrière un déclencheur mesuré dans l'ancienne
      gsap.killTweensOf(all);
      gsap.set(all.filter(Boolean), { clearProps: 'transform,opacity' });
      entered = true;
      for (const k of [1, 2, 3]) mark(k, 0);
    }
    ScrollTrigger.refresh();
  });
  let w = window.innerWidth;
  let hgt = window.innerHeight;
  let timer = 0;
  env.on(window, 'resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (window.innerWidth === w && window.innerHeight === hgt) return;
      w = window.innerWidth;
      hgt = window.innerHeight;
      rebuild();
    }, 200);
  });
  if (document.fonts && document.fonts.status !== 'loaded')
    document.fonts.ready.then(() => rebuild());

  env.undo(() => {
    window.clearTimeout(timer);
    teardown();
    delete motionHooks.view;
  });
}
