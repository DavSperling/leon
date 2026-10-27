/*
 * « Mémoire vive », le petit jeu du schéma des connexions : le moteur, sans React ni dessin. Leon rejoint la cible
 * (souris, doigt ou flèches) ; les outils branchés lâchent des fragments à attraper avant qu'ils s'éteignent ; des bugs
 * entrent par les bords, à éviter. Trois vies, un multiplicateur qui monte avec la série (×5 au plus), un niveau de plus
 * toutes les 20 s. Un fragment doré rapporte plus et aimante les autres quelques secondes.
 * Unités : celles du schéma (1000 × 460). `avancer` modifie la partie en place et rend ce qui s'est passé, pour les
 * effets (étincelles, secousse, textes).
 */

export const LARGEUR = 1000;
export const HAUTEUR = 460;
const CX = LARGEUR / 2;
const CY = HAUTEUR / 2;

const PRET = 2.4; // décompte avant les premiers fragments, en secondes
const DUREE_NIVEAU = 20;
const VIES = 3;
const BORD = 44; // Leon reste entier dans le schéma
const FREIN = 1.6; // les fragments ralentissent et se posent
const RAYON_FRAGMENT = 9;
const RAYON_OR = 12;
const RAYON_BUG = 13;
const INVINCIBLE = 1.4;
const AIMANT = 5;
const PORTEE_AIMANT = 240;

export type Point = { x: number; y: number };
export type Fragment = Point & { vx: number; vy: number; age: number; vie: number; or: boolean };
export type Bug = Point & { vx: number; vy: number; age: number; angle: number; suit: boolean };
export type Phase = 'pret' | 'jeu' | 'fin';
export type Partie = {
  phase: Phase;
  /** Secondes de jeu, négatives pendant le décompte. */
  t: number;
  leon: Point;
  score: number;
  serie: number;
  vies: number;
  niveau: number;
  fragments: Fragment[];
  bugs: Bug[];
  prochainFragment: number;
  prochainBug: number;
  invincible: number;
  aimant: number;
};
export type Evenement =
  | { type: 'emis'; x: number; y: number }
  | { type: 'attrape'; x: number; y: number; points: number; or: boolean }
  | { type: 'eteint'; x: number; y: number }
  | { type: 'touche'; x: number; y: number }
  | { type: 'niveau'; niveau: number }
  | { type: 'fin' };

export const RAYONS = {
  fragment: RAYON_FRAGMENT,
  or: RAYON_OR,
  bug: RAYON_BUG,
  aimant: PORTEE_AIMANT,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** ×1, puis un cran de plus toutes les quatre prises d'affilée. */
export const multiplicateur = (serie: number) => Math.min(5, 1 + Math.floor(serie / 4));

export function nouvellePartie(leon: Point = { x: CX, y: CY }): Partie {
  return {
    phase: 'pret',
    t: -PRET,
    leon: { ...leon },
    score: 0,
    serie: 0,
    vies: VIES,
    niveau: 1,
    fragments: [],
    bugs: [],
    prochainFragment: 0,
    prochainBug: 2.5,
    invincible: 0,
    aimant: 0,
  };
}

/** Un fragment part d'une pastille vers un point du milieu et s'y pose. */
function emettre(p: Partie, s: Point, n: number, hasard: () => number): Fragment {
  const a = hasard() * Math.PI * 2;
  const r = Math.sqrt(hasard());
  const vers = { x: CX + 280 * r * Math.cos(a), y: CY + 130 * r * Math.sin(a) };
  const dx = vers.x - s.x;
  const dy = vers.y - s.y;
  // Le frein arrête le fragment après vitesse / FREIN : il s'arrête entre 55 et 90 % du chemin.
  const k = (0.55 + 0.35 * hasard()) * FREIN;
  const or = p.t > 5 && hasard() < 0.07;
  return {
    x: s.x,
    y: s.y,
    vx: dx * k,
    vy: dy * k,
    age: 0,
    vie: or ? 2.6 : Math.max(2, 3.6 - 0.25 * n),
    or,
  };
}

/** Un bug entre par un bord, vers le milieu ou droit sur Leon ; dès le niveau 3, certains le suivent. */
function lacher(p: Partie, n: number, hasard: () => number): Bug {
  const cote = Math.floor(hasard() * 4);
  const u = hasard();
  const depart =
    cote === 0
      ? { x: -20, y: u * HAUTEUR }
      : cote === 1
        ? { x: LARGEUR + 20, y: u * HAUTEUR }
        : cote === 2
          ? { x: u * LARGEUR, y: -20 }
          : { x: u * LARGEUR, y: HAUTEUR + 20 };
  const vise = n >= 1 && hasard() < 0.5;
  const vers = vise ? p.leon : { x: CX + (hasard() - 0.5) * 600, y: CY + (hasard() - 0.5) * 300 };
  const dx = vers.x - depart.x;
  const dy = vers.y - depart.y;
  const len = Math.hypot(dx, dy) || 1;
  const v = Math.min(300, 120 + 28 * n) * (0.85 + 0.3 * hasard());
  return {
    ...depart,
    vx: (dx / len) * v,
    vy: (dy / len) * v,
    age: 0,
    angle: 0,
    suit: n >= 2 && hasard() < 0.3,
  };
}

/**
 * Un pas de jeu. `rayon` : celui de Leon, en unités du schéma ; `sources` : les pastilles qui lâchent les fragments
 * (les bords quand il n'y en a pas). `hasard` se remplace dans les tests.
 */
export function avancer(
  p: Partie,
  dt: number,
  cible: Point,
  sources: Point[],
  rayon: number,
  hasard: () => number = Math.random,
): Evenement[] {
  const ev: Evenement[] = [];
  if (p.phase === 'fin') return ev;

  // Leon rejoint la cible en douceur : une traîne courte, les tentacules font le reste.
  const suivi = 1 - Math.exp(-18 * dt);
  p.leon.x = clamp(p.leon.x + (cible.x - p.leon.x) * suivi, BORD, LARGEUR - BORD);
  p.leon.y = clamp(p.leon.y + (cible.y - p.leon.y) * suivi, BORD, HAUTEUR - BORD);
  p.t += dt;
  if (p.t < 0) return ev;
  p.phase = 'jeu';

  const niveau = 1 + Math.floor(p.t / DUREE_NIVEAU);
  if (niveau !== p.niveau) {
    p.niveau = niveau;
    ev.push({ type: 'niveau', niveau });
  }
  const n = niveau - 1;
  p.invincible = Math.max(0, p.invincible - dt);
  p.aimant = Math.max(0, p.aimant - dt);

  p.prochainFragment -= dt;
  if (p.prochainFragment <= 0) {
    p.prochainFragment = Math.max(0.32, 0.85 - 0.07 * n);
    const s = sources[Math.floor(hasard() * sources.length)] ?? {
      x: hasard() * LARGEUR,
      y: hasard() < 0.5 ? 0 : HAUTEUR,
    };
    p.fragments.push(emettre(p, s, n, hasard));
    ev.push({ type: 'emis', x: s.x, y: s.y });
  }
  p.prochainBug -= dt;
  if (p.prochainBug <= 0) {
    p.prochainBug = Math.max(0.65, 2.3 - 0.25 * n) * (0.7 + 0.6 * hasard());
    p.bugs.push(lacher(p, n, hasard));
  }

  const frein = Math.exp(-FREIN * dt);
  p.fragments = p.fragments.filter((f) => {
    f.age += dt;
    const dx = p.leon.x - f.x;
    const dy = p.leon.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    if (p.aimant > 0 && d < PORTEE_AIMANT) {
      f.vx += (dx / d) * 1400 * dt;
      f.vy += (dy / d) * 1400 * dt;
    }
    f.vx *= frein;
    f.vy *= frein;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (Math.hypot(p.leon.x - f.x, p.leon.y - f.y) < rayon + (f.or ? RAYON_OR : RAYON_FRAGMENT)) {
      p.serie += 1;
      const points = (f.or ? 50 : 10) * multiplicateur(p.serie);
      p.score += points;
      if (f.or) p.aimant = AIMANT;
      ev.push({ type: 'attrape', x: f.x, y: f.y, points, or: f.or });
      return false;
    }
    if (f.age >= f.vie) {
      p.serie = 0;
      ev.push({ type: 'eteint', x: f.x, y: f.y });
      return false;
    }
    return true;
  });

  p.bugs = p.bugs.filter((b) => {
    b.age += dt;
    b.angle += dt * 2.4;
    if (b.suit) {
      const v = Math.hypot(b.vx, b.vy);
      const dx = p.leon.x - b.x;
      const dy = p.leon.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, 0.9 * dt);
      b.vx += ((dx / d) * v - b.vx) * k;
      b.vy += ((dy / d) * v - b.vy) * k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Le bug touche le cœur de Leon, pas son halo : on pardonne un frôlement.
    if (
      p.invincible <= 0 &&
      Math.hypot(p.leon.x - b.x, p.leon.y - b.y) < rayon * 0.75 + RAYON_BUG
    ) {
      p.vies -= 1;
      p.serie = 0;
      p.invincible = INVINCIBLE;
      ev.push({ type: 'touche', x: b.x, y: b.y });
      return false;
    }
    const dehors = b.x < -60 || b.x > LARGEUR + 60 || b.y < -60 || b.y > HAUTEUR + 60;
    return b.age < 10 && !(dehors && b.age > 1);
  });

  if (p.vies <= 0) {
    p.phase = 'fin';
    // La partie se fige : ni anneau d'invincibilité ni aimant sur l'écran de fin.
    p.invincible = 0;
    p.aimant = 0;
    ev.push({ type: 'fin' });
  }
  return ev;
}
