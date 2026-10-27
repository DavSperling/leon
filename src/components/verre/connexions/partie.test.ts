import { describe, expect, test } from 'vitest';
import { avancer, multiplicateur, nouvellePartie, type Partie } from './partie';

const RAYON = 50;
const pile = () => 0.5;

/** Une partie lancée, sans apparition d'ici la fin du test. */
function enJeu(): Partie {
  const p = nouvellePartie();
  p.t = 0;
  p.phase = 'jeu';
  p.prochainFragment = 99;
  p.prochainBug = 99;
  return p;
}

const fragment = (x: number, y: number, age = 0) => ({
  x,
  y,
  vx: 0,
  vy: 0,
  age,
  vie: 3,
  or: false,
});
const bug = (x: number, y: number) => ({ x, y, vx: 0, vy: 0, age: 0, angle: 0, suit: false });

describe('Mémoire vive', () => {
  test('le décompte, puis un premier fragment lâché par une pastille', () => {
    const p = nouvellePartie();
    const source = { x: 120, y: 80 };
    expect(avancer(p, 1, p.leon, [source], RAYON, pile)).toEqual([]);
    expect(p.phase).toBe('pret');
    const ev = avancer(p, 1.5, p.leon, [source], RAYON, pile);
    expect(p.phase).toBe('jeu');
    expect(ev).toContainEqual({ type: 'emis', x: 120, y: 80 });
    expect(p.fragments).toHaveLength(1);
  });

  test('attraper un fragment : des points, la série monte, le multiplicateur suit', () => {
    const p = enJeu();
    p.fragments.push(fragment(p.leon.x + 20, p.leon.y));
    const ev = avancer(p, 0.016, p.leon, [], RAYON, pile);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'attrape', points: 10 }));
    expect(p.score).toBe(10);
    expect(p.serie).toBe(1);
    expect([multiplicateur(3), multiplicateur(4), multiplicateur(40)]).toEqual([1, 2, 5]);
  });

  test('un fragment qui s’éteint casse la série', () => {
    const p = enJeu();
    p.serie = 7;
    p.fragments.push(fragment(60, 60, 3));
    expect(avancer(p, 0.016, p.leon, [], RAYON, pile)).toContainEqual(
      expect.objectContaining({ type: 'eteint' }),
    );
    expect(p.serie).toBe(0);
    expect(p.fragments).toHaveLength(0);
  });

  test('un bug coûte une vie, puis Leon est intouchable un moment', () => {
    const p = enJeu();
    p.serie = 5;
    p.bugs.push(bug(p.leon.x, p.leon.y));
    avancer(p, 0.016, p.leon, [], RAYON, pile);
    expect([p.vies, p.serie]).toEqual([2, 0]);
    p.bugs.push(bug(p.leon.x, p.leon.y));
    avancer(p, 0.016, p.leon, [], RAYON, pile);
    expect(p.vies).toBe(2);
  });

  test('la dernière vie perdue termine la partie, qui ne bouge plus', () => {
    const p = enJeu();
    p.vies = 1;
    p.bugs.push(bug(p.leon.x, p.leon.y));
    expect(avancer(p, 0.016, p.leon, [], RAYON, pile)).toContainEqual({ type: 'fin' });
    expect(p.phase).toBe('fin');
    expect(avancer(p, 0.016, { x: 0, y: 0 }, [], RAYON, pile)).toEqual([]);
  });

  test('un niveau de plus toutes les 20 secondes', () => {
    const p = enJeu();
    p.t = 19.99;
    expect(avancer(p, 0.02, p.leon, [], RAYON, pile)).toContainEqual({ type: 'niveau', niveau: 2 });
  });

  test('Leon suit la cible sans sortir du schéma', () => {
    const p = enJeu();
    for (let i = 0; i < 60; i++) avancer(p, 0.016, { x: -500, y: 9999 }, [], RAYON, pile);
    expect(p.leon).toEqual({ x: 44, y: 416 });
  });
});
