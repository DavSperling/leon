'use client';

import { Gamepad2, Heart, RotateCcw, X } from 'lucide-react';
import { animate, type MotionValue } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Kbd, Tooltip } from '@/components/verre';
import { cn, nb } from '@/lib/verre';
import {
  avancer,
  type Bug,
  type Fragment,
  HAUTEUR,
  LARGEUR,
  multiplicateur,
  nouvellePartie,
  type Partie,
  type Phase,
  type Point,
  RAYONS,
} from './partie';

/*
 * « Mémoire vive » se joue sur le schéma des connexions, sans fenêtre : « Jouer » lance la partie, Leon suit la souris
 * (le doigt, ou les flèches et WASD/ZQSD), ses tentacules s'étirent, la ligne du haut du schéma devient le tableau des
 * scores. Fragments, bugs et étincelles se dessinent sur une toile glissée sous les pastilles ; les règles sont dans
 * partie.ts. Le record reste dans le navigateur. Mouvement réduit : pas de secousse.
 */

export type Hud = {
  phase: Phase;
  score: number;
  vies: number;
  multi: number;
  niveau: number;
  record: number;
  nouveau: boolean;
};

const RECORD = 'leon:memoire-vive:record';
const HUD_DEPART: Hud = {
  phase: 'pret',
  score: 0,
  vies: 3,
  multi: 1,
  niveau: 1,
  record: 0,
  nouveau: false,
};
const RESSORT = { type: 'spring', stiffness: 170, damping: 9, mass: 0.9 } as const;
const TOUR = Math.PI * 2;
const RAYON_LEON_PX = 38; // le rond de Leon fait 76 px
const AVANCE_CLAVIER = 36; // la cible se tient devant Leon : environ 650 unités par seconde
// e.code est la touche physique : WASD sur un clavier QWERTY, ZQSD sur un AZERTY.
const DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
};

function lireRecord(): number {
  try {
    return Number(localStorage.getItem(RECORD)) || 0;
  } catch {
    return 0; // stockage refusé (navigation privée, cookies bloqués) : pas de record
  }
}

function ecrireRecord(score: number) {
  try {
    localStorage.setItem(RECORD, String(score));
  } catch {
    // stockage refusé : le record se perd avec la page
  }
}

/** La partie en cours : ouverte ou non, la manche (une nouvelle remonte la toile), le tableau des scores. */
export function useJeu(
  centre: { x: MotionValue<number>; y: MotionValue<number> },
  repos: Point,
  instant: boolean,
) {
  const [actif, setActif] = useState(false);
  const [manche, setManche] = useState(0);
  const [hud, setHud] = useState(HUD_DEPART);
  const lancer = useCallback(() => {
    setHud({ ...HUD_DEPART, record: lireRecord() });
    setActif(true);
    setManche((m) => m + 1);
  }, []);
  const quitter = useCallback(() => {
    setActif(false);
    if (instant) {
      centre.x.set(repos.x);
      centre.y.set(repos.y);
      return;
    }
    animate(centre.x, repos.x, RESSORT);
    animate(centre.y, repos.y, RESSORT);
  }, [centre, repos, instant]);
  return { actif, manche, hud, setHud, lancer, quitter };
}

export function BoutonJeu({ onClick }: { onClick: () => void }) {
  const t = useTranslations('connections');
  return (
    <Tooltip content={nb(t('playHint'))}>
      <Button size="sm" variant="quiet" icon={Gamepad2} onClick={onClick}>
        {t('play')}
      </Button>
    </Tooltip>
  );
}

/** Le tableau des scores, à la place du résumé et de la légende pendant la partie. */
export function HudJeu({
  hud,
  onReplay,
  onQuit,
}: {
  hud: Hud;
  onReplay: () => void;
  onQuit: () => void;
}) {
  const t = useTranslations('connections');
  const format = useFormatter();
  const rejouer = useRef<HTMLButtonElement>(null);
  const fin = hud.phase === 'fin';
  useEffect(() => {
    if (fin) rejouer.current?.focus();
  }, [fin]);
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-muted tabular-nums">
        <span className="inline-flex items-center gap-2 text-fg-2">
          <Gamepad2 aria-hidden="true" strokeWidth={1.8} className="size-3.5 text-accent" />
          {t('gameName')}
        </span>
        {hud.phase === 'pret' && <span>{nb(t('gameHowTo'))}</span>}
        {hud.phase === 'jeu' && (
          <>
            <span>
              {t('gameScore')} <span className="text-fg">{format.number(hud.score)}</span>
            </span>
            {hud.multi > 1 && <span className="text-accent">×{hud.multi}</span>}
            <span>{t('gameLevel', { level: hud.niveau })}</span>
          </>
        )}
        {fin && (
          <>
            <span className="text-fg">{nb(t('gameOver', { score: hud.score }))}</span>
            {hud.nouveau && <span className="text-warning">{nb(t('gameNewBest'))}</span>}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-muted tabular-nums">
        <span className="inline-flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <Heart
              key={i}
              aria-hidden="true"
              strokeWidth={2}
              className={cn(
                'size-3.5 transition-colors',
                i < hud.vies ? 'fill-destructive text-destructive' : 'text-line-strong',
              )}
            />
          ))}
        </span>
        {/* Les vies quand elles changent, la fin de partie : lus une fois, sans annoncer chaque point. */}
        <span className="sr-only" aria-live="polite">
          {fin ? nb(t('gameOver', { score: hud.score })) : t('gameLives', { count: hud.vies })}
        </span>
        <span>
          {t('gameBest')}{' '}
          <span className="text-fg-2">{format.number(Math.max(hud.record, hud.score))}</span>
        </span>
        {fin ? (
          <span className="inline-flex items-center gap-1">
            <Button ref={rejouer} size="sm" variant="primary" icon={RotateCcw} onClick={onReplay}>
              {t('gameReplay')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onQuit}>
              {t('gameQuit')}
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="quiet" icon={X} onClick={onQuit}>
            {t('gameQuit')}
            <Kbd>esc</Kbd>
          </Button>
        )}
      </div>
    </>
  );
}

type Etincelle = Point & { vx: number; vy: number; age: number; vie: number; couleur: string };
type Texte = Point & { age: number; texte: string; couleur: string; taille: number };
type Onde = Point & { age: number; couleur: string; portee: number };
type Couleurs = {
  accent: string;
  or: string;
  bug: string;
  fond: string;
  texte: string;
  police: string;
};

function gerbe(liste: Etincelle[], at: Point, couleur: string, n: number, vitesse: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TOUR;
    const v = vitesse * (0.35 + Math.random() * 0.65);
    liste.push({
      x: at.x,
      y: at.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      age: 0,
      vie: 0.4 + Math.random() * 0.4,
      couleur,
    });
  }
}

function purger<T extends { age: number }>(liste: T[], vie: (x: T) => number) {
  for (let i = liste.length - 1; i >= 0; i--) {
    const x = liste[i];
    if (x && x.age >= vie(x)) liste.splice(i, 1);
  }
}

function etoile(ctx: CanvasRenderingContext2D, r: number, tour: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = tour + (i * TOUR) / 8;
    const d = i % 2 ? r * 0.42 : r;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
}

function dessinerFragment(ctx: CanvasRenderingContext2D, f: Fragment, c: Couleurs) {
  const reste = f.vie - f.age;
  const couleur = f.or ? c.or : c.accent;
  const r = (f.or ? RAYONS.or : RAYONS.fragment) * Math.min(1, f.age / 0.18);
  // La dernière seconde, il clignote de plus en plus vite.
  ctx.globalAlpha = reste < 0.9 && Math.sin(reste * (40 - reste * 25)) < 0 ? 0.25 : 1;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = couleur;
  ctx.shadowColor = couleur;
  ctx.shadowBlur = 18;
  if (f.or) etoile(ctx, r * 1.25, f.age * 3);
  else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TOUR);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.18;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1, 0, TOUR);
  ctx.fill();
  ctx.restore();
}

function dessinerBug(ctx: CanvasRenderingContext2D, b: Bug, c: Couleurs) {
  const r = RAYONS.bug;
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.shadowColor = c.bug;
  ctx.shadowBlur = b.suit ? 22 : 12;
  ctx.fillStyle = c.fond;
  ctx.strokeStyle = c.bug;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, 4);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(5, 5);
  ctx.moveTo(5, -5);
  ctx.lineTo(-5, 5);
  ctx.stroke();
  ctx.restore();
}

/** La toile de la partie, au-dessus des traits et sous les pastilles ; une manche par montage. */
export function ToileJeu({
  centre,
  box,
  sources,
  instant,
  onHud,
  onQuit,
}: {
  centre: { x: MotionValue<number>; y: MotionValue<number> };
  box: RefObject<HTMLDivElement | null>;
  /** Les pastilles du schéma, d'où partent les fragments. */
  sources: Point[];
  instant: boolean;
  onHud: (hud: Hud) => void;
  onQuit: () => void;
}) {
  const t = useTranslations('connections');
  const toile = useRef<HTMLCanvasElement>(null);
  const depart = useRef(sources);
  useEffect(() => {
    depart.current = sources;
  }, [sources]);

  useEffect(() => {
    const el = box.current;
    const canvas = toile.current;
    const ctx = canvas?.getContext('2d');
    if (!el || !canvas || !ctx) return;
    const css = getComputedStyle(el);
    const lire = (nom: string) => css.getPropertyValue(nom).trim();
    const c: Couleurs = {
      accent: lire('--accent'),
      or: lire('--warning'),
      bug: lire('--destructive'),
      fond: lire('--menu'),
      texte: lire('--text'),
      police: lire('--mono') || 'monospace',
    };

    centre.x.stop();
    centre.y.stop();
    const p: Partie = nouvellePartie({ x: centre.x.get(), y: centre.y.get() });
    const cible: Point = { ...p.leon };
    const touches = new Set<string>();
    const etincelles: Etincelle[] = [];
    const textes: Texte[] = [];
    const ondes: Onde[] = [];
    const record = lireRecord();
    let unite = 1; // px par unité du schéma
    let secousse = 0;
    let signe = '';
    let image = 0;
    let avant = performance.now();

    const taille = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      unite = r.width / LARGEUR || 1;
      ctx.setTransform(dpr * unite, 0, 0, dpr * unite, 0, 0);
    };
    taille();
    const suivi = new ResizeObserver(taille);
    suivi.observe(el);

    // La souris pilote Leon même hors du schéma : il s'arrête au bord.
    const viser = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      cible.x = ((e.clientX - r.left) * LARGEUR) / r.width;
      cible.y = ((e.clientY - r.top) * HAUTEUR) / r.height;
    };
    const presser = (e: KeyboardEvent) => {
      // On tape dans un champ (la palette ⌘K…) : ni Échap ni lettres pour le jeu.
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]'))
        return;
      if (e.key === 'Escape') {
        onQuit();
        return;
      }
      if (p.phase === 'fin' || !(e.code in DIRECTIONS) || e.metaKey || e.ctrlKey || e.altKey)
        return;
      e.preventDefault(); // les flèches ne font pas défiler la page
      touches.add(e.code);
    };
    const lacher = (e: KeyboardEvent) => touches.delete(e.code);
    const oublier = () => touches.clear();
    window.addEventListener('pointermove', viser);
    window.addEventListener('pointerdown', viser);
    window.addEventListener('keydown', presser);
    window.addEventListener('keyup', lacher);
    window.addEventListener('blur', oublier);
    el.focus({ preventScroll: true });

    const texte = (at: Point, contenu: string, couleur: string, taille = 19) =>
      textes.push({ x: at.x, y: at.y, age: 0, texte: contenu, couleur, taille });

    const boucle = (now: number) => {
      // Onglet en arrière-plan : pas de saut. La première image peut dater d'avant le montage : pas de pas négatif.
      const dt = Math.min(0.05, Math.max(0, (now - avant) / 1000));
      avant = now;
      const rayon = RAYON_LEON_PX / unite;

      let dx = 0;
      let dy = 0;
      for (const k of touches) {
        dx += DIRECTIONS[k]?.x ?? 0;
        dy += DIRECTIONS[k]?.y ?? 0;
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        cible.x = p.leon.x + (dx / len) * AVANCE_CLAVIER;
        cible.y = p.leon.y + (dy / len) * AVANCE_CLAVIER;
      }

      const multiAvant = multiplicateur(p.serie);
      const vivant = p.phase !== 'fin';
      for (const e of avancer(p, dt, cible, depart.current, rayon)) {
        if (e.type === 'emis')
          ondes.push({ x: e.x, y: e.y, age: 0, couleur: c.accent, portee: 26 });
        else if (e.type === 'attrape') {
          gerbe(etincelles, e, e.or ? c.or : c.accent, e.or ? 22 : 10, e.or ? 300 : 210);
          texte({ x: e.x, y: e.y - 14 }, `+${e.points}`, e.or ? c.or : c.accent);
          if (e.or) texte({ x: p.leon.x, y: p.leon.y - rayon - 30 }, t('gameMagnet'), c.or, 24);
        } else if (e.type === 'eteint') gerbe(etincelles, e, c.accent, 5, 50);
        else if (e.type === 'touche') {
          gerbe(etincelles, e, c.bug, 24, 330);
          ondes.push({ ...p.leon, age: 0, couleur: c.bug, portee: 110 });
          secousse = instant ? 0 : 0.35;
        } else if (e.type === 'niveau')
          texte(
            { x: p.leon.x, y: p.leon.y - rayon - 34 },
            t('gameLevel', { level: e.niveau }),
            c.texte,
            30,
          );
        else if (e.type === 'fin') {
          for (const f of p.fragments) gerbe(etincelles, f, f.or ? c.or : c.accent, 6, 140);
          for (const b of p.bugs) gerbe(etincelles, b, c.bug, 10, 200);
          p.fragments = [];
          p.bugs = [];
          if (p.score > record) ecrireRecord(p.score);
        }
      }
      const multi = multiplicateur(p.serie);
      if (multi > multiAvant)
        texte({ x: p.leon.x, y: p.leon.y - rayon - 12 }, `×${multi}`, c.accent, 24);
      if (vivant) {
        centre.x.set(p.leon.x);
        centre.y.set(p.leon.y);
      }

      const s = `${p.phase}|${p.score}|${p.vies}|${multi}|${p.niveau}`;
      if (s !== signe) {
        signe = s;
        onHud({
          phase: p.phase,
          score: p.score,
          vies: p.vies,
          multi,
          niveau: p.niveau,
          record,
          nouveau: p.phase === 'fin' && p.score > record,
        });
      }

      if (secousse > 0) {
        secousse = Math.max(0, secousse - dt);
        const a = 7 * (secousse / 0.35);
        el.style.translate = secousse
          ? `${(Math.random() - 0.5) * a}px ${(Math.random() - 0.5) * a}px`
          : '';
      }

      for (const e of etincelles) {
        e.age += dt;
        e.vx *= Math.exp(-3 * dt);
        e.vy *= Math.exp(-3 * dt);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (const x of textes) x.age += dt;
      for (const o of ondes) o.age += dt;
      purger(etincelles, (e) => e.vie);
      purger(textes, () => 0.9);
      purger(ondes, () => 0.9);

      ctx.clearRect(-100, -100, LARGEUR + 200, HAUTEUR + 200);
      ctx.lineCap = 'round';
      for (const o of ondes) {
        const k = o.age / 0.9;
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.strokeStyle = o.couleur;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 12 + Math.sqrt(k) * o.portee, 0, TOUR);
        ctx.stroke();
      }
      if (p.aimant > 0) {
        ctx.globalAlpha = Math.min(1, p.aimant) * (0.35 + 0.2 * Math.sin(now / 90));
        ctx.strokeStyle = c.or;
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.arc(p.leon.x, p.leon.y, rayon + 14 + 3 * Math.sin(now / 140), 0, TOUR);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (p.invincible > 0 && Math.sin(now / 45) > 0) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = c.bug;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.leon.x, p.leon.y, rayon + 6, 0, TOUR);
        ctx.stroke();
      }
      for (const f of p.fragments) dessinerFragment(ctx, f, c);
      for (const b of p.bugs) dessinerBug(ctx, b, c);
      for (const e of etincelles) {
        const k = e.age / e.vie;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = e.couleur;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 2.6 * (1 - k * 0.6), 0, TOUR);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const x of textes) {
        const k = x.age / 0.9;
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = x.couleur;
        ctx.font = `600 ${x.taille}px ${c.police}`;
        ctx.fillText(x.texte, x.x, x.y - k * 34);
      }
      if (p.phase === 'pret') {
        // Le décompte, au-dessus de Leon : chaque chiffre grossit puis s'efface.
        const reste = -p.t;
        const k = reste % 1;
        ctx.globalAlpha = Math.min(1, k * 2.5);
        ctx.fillStyle = c.texte;
        ctx.font = `700 ${34 + (1 - k) * 18}px ${c.police}`;
        ctx.fillText(String(Math.ceil(reste)), p.leon.x, p.leon.y - rayon - 34);
      }
      ctx.globalAlpha = 1;

      if (vivant || etincelles.length || textes.length || ondes.length)
        image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);

    return () => {
      cancelAnimationFrame(image);
      suivi.disconnect();
      window.removeEventListener('pointermove', viser);
      window.removeEventListener('pointerdown', viser);
      window.removeEventListener('keydown', presser);
      window.removeEventListener('keyup', lacher);
      window.removeEventListener('blur', oublier);
      el.style.translate = '';
    };
  }, [box, centre, instant, onHud, onQuit, t]);

  return (
    // sans contenu de repli, la toile n'existe pas pour un lecteur d'écran ; le tableau des scores dit l'essentiel
    <canvas ref={toile} className="pointer-events-none absolute inset-0 z-[1] size-full" />
  );
}
