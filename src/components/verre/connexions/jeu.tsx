'use client';

import { ArrowRight, Play, RotateCcw, Sparkles } from 'lucide-react';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, Logo } from '@/components/verre';

type Point = { x: number; y: number };
type Obstacle = Point & { r: number };
type Level = { name: string; goal: Point; stars: Point[]; obstacles: Obstacle[] };

const FIRST_LEVEL: Level = {
  name: 'Premier contact',
  goal: { x: 286, y: 250 },
  stars: [
    { x: 135, y: 343 },
    { x: 205, y: 285 },
  ],
  obstacles: [],
};

const LEVELS: Level[] = [
  FIRST_LEVEL,
  {
    name: 'Le détour',
    goal: { x: 294, y: 222 },
    stars: [
      { x: 138, y: 308 },
      { x: 212, y: 252 },
      { x: 254, y: 228 },
    ],
    obstacles: [{ x: 192, y: 354, r: 25 }],
  },
  {
    name: 'Trou de mémoire',
    goal: { x: 288, y: 180 },
    stars: [
      { x: 132, y: 291 },
      { x: 198, y: 219 },
      { x: 252, y: 188 },
    ],
    obstacles: [
      { x: 185, y: 337, r: 24 },
      { x: 250, y: 310, r: 25 },
    ],
  },
  {
    name: 'Dernière connexion',
    goal: { x: 294, y: 143 },
    stars: [
      { x: 133, y: 274 },
      { x: 200, y: 191 },
      { x: 254, y: 153 },
    ],
    obstacles: [
      { x: 176, y: 340, r: 24 },
      { x: 236, y: 287, r: 25 },
      { x: 171, y: 170, r: 21 },
    ],
  },
];

const ANCHOR = { x: 66, y: 400 };
const DISTANCE = 58;
const LAUNCH_SCALE = 9;
const STAR_RADIUS = 16;
const BALL_RADIUS = 19;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function JeuConnexions({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [levelIndex, setLevelIndex] = useState(0);
  const [ball, setBall] = useState<Point>(ANCHOR);
  const [collected, setCollected] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState(false);
  const [won, setWon] = useState(false);
  const [status, setStatus] = useState('Attrape Léon, tire vers l’arrière, puis relâche.');
  const svg = useRef<SVGSVGElement>(null);
  const ballRef = useRef<Point>(ANCHOR);
  const velocity = useRef<Point>({ x: 0, y: 0 });
  const collectedRef = useRef<number[]>([]);
  const dragStart = useRef<Point | null>(null);
  const level = LEVELS[levelIndex] ?? FIRST_LEVEL;

  const reset = () => {
    ballRef.current = ANCHOR;
    velocity.current = { x: 0, y: 0 };
    collectedRef.current = [];
    setBall(ANCHOR);
    setCollected([]);
    setFlying(false);
    setWon(false);
    setDragging(false);
    setStatus('Attrape Léon, tire vers l’arrière, puis relâche.');
  };

  const launch = (pull: Point) => {
    const dx = ANCHOR.x - pull.x;
    const dy = ANCHOR.y - pull.y;
    if (Math.hypot(dx, dy) < 10) return;
    velocity.current = { x: dx * LAUNCH_SCALE, y: dy * LAUNCH_SCALE };
    setDragging(false);
    setFlying(true);
    setStatus('En plein vol…');
  };

  useEffect(() => {
    if (!open || !flying) return;
    let frame = 0;
    let previous = performance.now();
    let elapsed = 0;
    const tick = (time: number) => {
      const dt = Math.min((time - previous) / 1000, 0.032);
      previous = time;
      elapsed += dt;
      const next = { ...ballRef.current };
      const speed = velocity.current;
      speed.y += 430 * dt;
      next.x += speed.x * dt;
      next.y += speed.y * dt;

      for (const obstacle of level.obstacles) {
        const dx = next.x - obstacle.x;
        const dy = next.y - obstacle.y;
        const distance = Math.hypot(dx, dy) || 1;
        const min = obstacle.r + BALL_RADIUS;
        if (distance < min) {
          const nx = dx / distance;
          const ny = dy / distance;
          next.x = obstacle.x + nx * min;
          next.y = obstacle.y + ny * min;
          const dot = speed.x * nx + speed.y * ny;
          if (dot < 0) {
            speed.x = (speed.x - 1.65 * dot * nx) * 0.78;
            speed.y = (speed.y - 1.65 * dot * ny) * 0.78;
          }
        }
      }

      level.stars.forEach((star, index) => {
        if (collectedRef.current.includes(index)) return;
        if (Math.hypot(next.x - star.x, next.y - star.y) < STAR_RADIUS + BALL_RADIUS) {
          collectedRef.current = [...collectedRef.current, index];
          setCollected(collectedRef.current);
        }
      });

      if (Math.hypot(next.x - level.goal.x, next.y - level.goal.y) < 34) {
        if (collectedRef.current.length === level.stars.length) {
          setWon(true);
          setFlying(false);
          setStatus(
            levelIndex === LEVELS.length - 1
              ? 'Toutes les connexions sont rétablies !'
              : 'Niveau réussi !',
          );
          return;
        }
      }

      if (next.x < BALL_RADIUS || next.x > 360 - BALL_RADIUS) {
        speed.x *= -0.72;
        next.x = clamp(next.x, BALL_RADIUS, 360 - BALL_RADIUS);
      }
      if (next.y < BALL_RADIUS || next.y > 460 - BALL_RADIUS) {
        speed.y *= -0.72;
        next.y = clamp(next.y, BALL_RADIUS, 460 - BALL_RADIUS);
      }
      ballRef.current = next;
      setBall(next);

      if (elapsed > 6 || (elapsed > 0.8 && Math.hypot(speed.x, speed.y) < 38)) {
        setFlying(false);
        setStatus('Presque ! Replace Léon et tente un autre angle.');
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flying, level, levelIndex, open]);

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return ANCHOR;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 360,
      y: ((event.clientY - rect.top) / rect.height) * 500,
    };
  };

  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (
      flying ||
      won ||
      Math.hypot(ball.x - pointFromEvent(event).x, ball.y - pointFromEvent(event).y) > 36
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = pointFromEvent(event);
    setDragging(true);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart.current) return;
    const point = pointFromEvent(event);
    const dx = point.x - dragStart.current.x;
    const dy = point.y - dragStart.current.y;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, DISTANCE / length);
    const next = { x: ANCHOR.x + dx * scale, y: ANCHOR.y + dy * scale };
    ballRef.current = next;
    setBall(next);
  };
  const up = () => {
    if (!dragging) return;
    dragStart.current = null;
    launch(ballRef.current);
  };

  const nextLevel = () => {
    if (levelIndex >= LEVELS.length - 1) {
      setLevelIndex(0);
      reset();
      return;
    }
    setLevelIndex((index) => index + 1);
    reset();
  };

  return (
    <>
      <Button icon={Play} size={compact ? 'md' : 'sm'} onClick={() => setOpen(true)}>
        Jouer à Leon Link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={
            <span className="inline-flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-accent" />
              Leon Link
            </span>
          }
          description="Étire Léon vers l’arrière, puis relâche-le pour récupérer les fragments et atteindre le portail."
          size="lg"
          className="gap-3!"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[12px] text-muted">
              NIVEAU {levelIndex + 1} / {LEVELS.length}{' '}
              <span className="text-fg-2">· {level.name}</span>
            </p>
            <div
              className="flex items-center gap-1"
              role="img"
              aria-label={`${collected.length} fragments sur ${level.stars.length}`}
            >
              {level.stars.map((star, index) => (
                <Sparkles
                  key={`${star.x}-${star.y}`}
                  aria-hidden="true"
                  className={`size-4 ${collected.includes(index) ? 'text-accent' : 'text-muted/50'}`}
                />
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-[radial-gradient(ellipse_at_70%_80%,color-mix(in_srgb,var(--success)_18%,transparent),transparent_48%),radial-gradient(ellipse_at_22%_25%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_52%),var(--glass-2)]">
            <svg
              ref={svg}
              viewBox="0 0 360 500"
              className="block max-h-[58dvh] w-full touch-none select-none"
              role="img"
              aria-label={`Leon Link, niveau ${levelIndex + 1}. ${status}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <defs>
                <radialGradient id="leon-game-goal">
                  <stop stopColor="var(--accent)" stopOpacity=".45" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </radialGradient>
                <filter id="leon-game-glow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d={`M${ANCHOR.x} ${ANCHOR.y} Q${(ANCHOR.x + ball.x) / 2 - 12} ${(ANCHOR.y + ball.y) / 2 + 10} ${ball.x} ${ball.y}`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={dragging ? 3 : 1.5}
                strokeOpacity=".75"
                strokeDasharray={dragging ? 'none' : '3 7'}
              />
              <circle cx={level.goal.x} cy={level.goal.y} r="40" fill="url(#leon-game-goal)" />
              <circle
                cx={level.goal.x}
                cy={level.goal.y}
                r="22"
                fill="none"
                stroke="var(--accent)"
                strokeOpacity=".85"
                strokeWidth="2"
                strokeDasharray="3 4"
              />
              <circle
                cx={level.goal.x}
                cy={level.goal.y}
                r="8"
                fill="var(--accent)"
                opacity=".75"
              />
              {level.stars.map(
                (star, index) =>
                  !collected.includes(index) && (
                    <g key={`${star.x}-${star.y}`} filter="url(#leon-game-glow)">
                      <circle
                        cx={star.x}
                        cy={star.y}
                        r="13"
                        fill="var(--accent)"
                        fillOpacity=".12"
                        stroke="var(--accent)"
                        strokeOpacity=".55"
                      />
                      <path
                        d={`M${star.x} ${star.y - 6}l1.8 4.2 4.5.4-3.4 3 1 4.4-3.9-2.3-3.9 2.3 1-4.4-3.4-3 4.5-.4z`}
                        fill="var(--accent)"
                      />
                    </g>
                  ),
              )}
              {level.obstacles.map((obstacle) => (
                <g key={`${obstacle.x}-${obstacle.y}`}>
                  <circle
                    cx={obstacle.x}
                    cy={obstacle.y}
                    r={obstacle.r + 7}
                    fill="var(--destructive)"
                    fillOpacity=".06"
                  />
                  <circle
                    cx={obstacle.x}
                    cy={obstacle.y}
                    r={obstacle.r}
                    fill="var(--glass-3)"
                    stroke="var(--line-strong)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={obstacle.x}
                    cy={obstacle.y}
                    r="4"
                    fill="var(--destructive)"
                    fillOpacity=".75"
                  />
                </g>
              ))}
              {!flying && !won && (
                <circle cx={ANCHOR.x} cy={ANCHOR.y} r="5" fill="var(--accent)" fillOpacity=".55" />
              )}
              <g
                className={dragging ? 'cursor-grabbing' : flying ? 'cursor-default' : 'cursor-grab'}
              >
                <circle cx={ball.x} cy={ball.y} r="29" fill="var(--accent)" fillOpacity=".12" />
                <circle
                  cx={ball.x}
                  cy={ball.y}
                  r={BALL_RADIUS + 4}
                  fill="var(--float)"
                  stroke="var(--line-strong)"
                  strokeWidth="1.5"
                />
                <foreignObject
                  x={ball.x - 18}
                  y={ball.y - 18}
                  width="36"
                  height="36"
                  className="pointer-events-none"
                >
                  <div className="grid size-9 place-items-center">
                    <Logo className="size-8 text-[13px]" />
                  </div>
                </foreignObject>
              </g>
              {won && (
                <text
                  x="180"
                  y="76"
                  textAnchor="middle"
                  fill="var(--accent)"
                  fontSize="13"
                  fontFamily="var(--font-mono)"
                >
                  CONNEXION RÉTABLIE
                </text>
              )}
            </svg>
          </div>

          <p aria-live="polite" className="min-h-5 text-center text-[13px] text-fg-2">
            {status}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="quiet" icon={RotateCcw} onClick={reset}>
              Recommencer
            </Button>
            {won ? (
              <Button
                size="sm"
                icon={levelIndex === LEVELS.length - 1 ? RotateCcw : ArrowRight}
                onClick={nextLevel}
              >
                {levelIndex === LEVELS.length - 1 ? 'Rejouer' : 'Niveau suivant'}
              </Button>
            ) : !flying && !dragging ? (
              <Button
                size="sm"
                icon={Play}
                onClick={() => {
                  const duration = 0.82 + levelIndex * 0.08;
                  const vx = (level.goal.x - ANCHOR.x) / duration;
                  const vy = (level.goal.y - ANCHOR.y - 0.5 * 430 * duration ** 2) / duration;
                  launch({ x: ANCHOR.x - vx / LAUNCH_SCALE, y: ANCHOR.y - vy / LAUNCH_SCALE });
                }}
              >
                Lancer
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
