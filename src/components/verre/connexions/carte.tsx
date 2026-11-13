'use client';

import { CircleStop, Pause, TriangleAlert, X } from 'lucide-react';
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type PointerEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureKind, ProviderId } from '@/capture/turn';
import { GlassCard, Logo, ToolIcon, Tooltip } from '@/components/verre';
import { cn, formatSince, nb, useInstant, useMinWidth } from '@/lib/verre';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import type { ChannelHealth } from '@/server/memory/stale';
import { BoutonJeu, HudJeu, ToileJeu, useJeu } from './jeu';
import { connState } from './parts';

/*
 * Schéma vivant des connexions, en tête de l'écran : Leon au centre, un trait vers chaque outil branché (à gauche) et
 * vers chaque canal de capture (à droite). Le trait dit l'état : actif (des points montent vers Leon), en pause (fin,
 * immobile), en erreur ou arrêtée (pointillés rouges, ×), capture en retard (pointillés ambre), aucune capture (pointillés
 * pâles). Survol ou focus d'une pastille : son trait ressort, une bulle dit ses connexions ; un clic ouvre la fenêtre de
 * l'outil (ou les Réglages du canal). Le rond central se tire à la souris : les traits suivent en s'étirant, puis il
 * revient en place avec un rebond. Mouvement réduit : rien ne bouge tout seul.
 * « Jouer » transforme le schéma en jeu d'arcade, sur place (jeu.tsx) : Leon suit la souris, les pastilles lâchent des
 * fragments, la ligne du haut compte les points ; pastilles et rond ne s'attrapent plus le temps de la partie.
 * Sous 760 px de large, le schéma s'efface : la liste « Vos outils branchés » suffit.
 */

const W = 1000;
const H = 460;
const CX = W / 2;
const CY = H / 2 + 4;
const DAY = 86_400_000;
const REPOS = { x: CX, y: CY };

type Etat = 'actif' | 'pause' | 'erreur' | 'retard' | 'vide';
type Base = { id: string; label: string; etat: Etat; x: number; y: number; bow: number };
type Noeud =
  | (Base & { type: 'outil'; provider: ProviderId; conns: ConnectionView[] })
  | (Base & { type: 'canal'; channel: CaptureKind; detail: string; to: string });
type Centre = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  lx: MotionValue<number>;
  ly: MotionValue<number>;
};

// L'endroit des Réglages où chaque canal se branche : les sessions des outils de code (Claude Code, Codex, Cursor,
// Antigravity) se captent par les crochets que pose la commande d'installation des ordinateurs ; `remember` (MCP) vient d'un assistant branché.
const CANAL_REGLAGE: Record<CaptureKind, string> = {
  claude_code: '/reglages#ordinateurs',
  codex: '/reglages#ordinateurs',
  cursor: '/reglages#ordinateurs',
  antigravity: '/reglages#ordinateurs',
  claude_ai: '/reglages#extension',
  chatgpt: '/reglages#extension',
  mcp_remember: '/reglages#assistants',
};

const STROKES: Record<Etat, { stroke: string; width: number; dash?: string; opacity: number }> = {
  actif: { stroke: 'var(--accent)', width: 1.3, opacity: 0.55 },
  pause: { stroke: 'var(--line-strong)', width: 1, opacity: 1 },
  vide: { stroke: 'var(--line-strong)', width: 1, dash: '2 6', opacity: 1 },
  erreur: { stroke: 'var(--destructive)', width: 1.2, dash: '4 5', opacity: 0.75 },
  retard: { stroke: 'var(--warning)', width: 1.3, dash: '1 6', opacity: 0.9 },
};

const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Un outil est en erreur dès qu'une de ses connexions l'est (ou s'est arrêtée), en pause si toutes le sont. */
function etatOutil(list: ConnectionView[]): Etat {
  if (list.some((c) => c.creatorLeft || c.status === 'error')) return 'erreur';
  if (list.every((c) => c.status === 'paused')) return 'pause';
  return 'actif';
}

/** Points sur un arc d'ellipse, de `from` à `to` degrés ; un sur deux un peu plus près du centre. */
function arc(
  n: number,
  from: number,
  to: number,
  rx: number,
  ry: number,
  inner: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => {
    const deg = n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    const f = i % 2 ? inner : 1;
    return { x: CX + rx * f * Math.cos(a), y: CY + ry * f * Math.sin(a) };
  });
}

function noeuds(
  catalog: CatalogItem[],
  conns: ConnectionView[],
  channels: ChannelHealth[],
  stale: string[],
  now: Date,
  locale: string,
  t: ReturnType<typeof useTranslations<'connections'>>,
): Noeud[] {
  const outils = catalog.filter((p) => conns.some((c) => c.provider === p.id));
  const posOutils = arc(outils.length, -78, -282, 400, 182, 0.84);
  const canaux = channels.filter(
    (c): c is ChannelHealth & { kind: CaptureKind } => c.kind in CANAL_REGLAGE,
  );
  const posCanaux = arc(canaux.length, -36, 36, 385, 178, 0.9);
  return [
    ...outils.map((p, i): Noeud => {
      const list = conns.filter((c) => c.provider === p.id);
      const pos = posOutils[i] ?? { x: CX, y: CY };
      return {
        type: 'outil',
        id: p.id,
        provider: p.id,
        label: p.label,
        conns: list,
        etat: etatOutil(list),
        bow: i % 2 ? 1 : -1,
        ...pos,
      };
    }),
    ...canaux.map((c, i): Noeud => {
      const last = c.lastCaptureAt;
      const late = stale.includes(c.kind);
      const detail = !last
        ? t('captureNone')
        : late
          ? t('captureSince', { days: Math.floor((now.getTime() - last.getTime()) / DAY) })
          : t('lastCapture', { time: formatSince(last, now, locale) });
      const pos = posCanaux[i] ?? { x: CX, y: CY };
      return {
        type: 'canal',
        id: c.kind,
        channel: c.kind,
        label: c.kindLabel,
        detail,
        to: CANAL_REGLAGE[c.kind],
        etat: !last ? 'vide' : late ? 'retard' : 'actif',
        bow: i % 2 ? -1 : 1,
        ...pos,
      };
    }),
  ];
}

/** Point de contrôle de la courbe pastille → centre : un léger arc, plus la traîne élastique du centre quand on le tire. */
function controle(
  n: Noeud,
  x: number,
  y: number,
  lx: number,
  ly: number,
): { cx: number; cy: number } {
  const dx = x - n.x;
  const dy = y - n.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = 0.06 * len * n.bow;
  return {
    cx: (n.x + x) / 2 - (dy / len) * bow + (lx - x) * 0.75,
    cy: (n.y + y) / 2 + (dx / len) * bow + (ly - y) * 0.75,
  };
}

function useCourbe(n: Noeud, c: Centre): MotionValue<string> {
  return useTransform([c.x, c.y, c.lx, c.ly], (v: number[]) => {
    const [x = CX, y = CY, lx = CX, ly = CY] = v;
    const { cx, cy } = controle(n, x, y, lx, ly);
    return `M${n.x} ${n.y}Q${cx} ${cy} ${x} ${y}`;
  });
}

function Trait({
  n,
  i,
  centre,
  hot,
  dim,
  instant,
}: {
  n: Noeud;
  i: number;
  centre: Centre;
  hot: boolean;
  dim: boolean;
  instant: boolean;
}) {
  const d = useCourbe(n, centre);
  const s = STROKES[n.etat];
  const pathId = `cx-trait-${n.id}`;
  const dur = 2.4 + (i % 3) * 0.45;
  return (
    <g>
      <motion.path
        id={pathId}
        d={d}
        fill="none"
        stroke={s.stroke}
        strokeWidth={hot ? s.width + 1 : s.width}
        strokeDasharray={s.dash}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        // en attribut : motion ne repasse pas un `style` changé sur un chemin déjà monté
        strokeOpacity={dim ? 0.14 : hot ? 1 : s.opacity}
        className="cx-trait"
      />
      {/* Ce que l'outil envoie à Leon : deux points qui montent le long du trait, décalés. */}
      {n.etat === 'actif' &&
        !instant &&
        [0, 1].map((k) => {
          const begin = `${-(i * 0.45 + k * (dur / 2))}s`;
          return (
            <circle
              key={k}
              r={hot ? 3.2 : 2.4}
              fill="var(--accent)"
              opacity="0"
              style={{ opacity: dim ? 0.2 : undefined }}
            >
              <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite">
                <mpath href={`#${pathId}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;.95;.95;0"
                keyTimes="0;.15;.82;1"
                dur={`${dur}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
    </g>
  );
}

/** Le milieu de la courbe (t = 0,5 de la courbe de Bézier), en % du schéma sur un axe. */
function useMilieu(n: Noeud, c: Centre, axis: 'x' | 'y'): MotionValue<string> {
  return useTransform([c.x, c.y, c.lx, c.ly], (v: number[]) => {
    const [x = CX, y = CY, lx = CX, ly = CY] = v;
    const { cx, cy } = controle(n, x, y, lx, ly);
    return axis === 'x'
      ? pct(0.25 * n.x + 0.5 * cx + 0.25 * x, W)
      : pct(0.25 * n.y + 0.5 * cy + 0.25 * y, H);
  });
}

/** La croix d'un trait en erreur, au milieu de la courbe (elle suit le centre quand on le tire). */
function Croix({ n, centre, dim }: { n: Noeud; centre: Centre; dim: boolean }) {
  const left = useMilieu(n, centre, 'x');
  const top = useMilieu(n, centre, 'y');
  return (
    <motion.span
      aria-hidden="true"
      style={{ left, top, opacity: dim ? 0.2 : 1 }}
      className="cx-trait absolute grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-destructive-line bg-menu text-destructive"
    >
      <X strokeWidth={2.4} className="size-2.5" />
    </motion.span>
  );
}

function EtatIcone({ n }: { n: Noeud }) {
  if (n.etat === 'pause')
    return <Pause aria-hidden="true" strokeWidth={2} className="size-3 text-muted" />;
  if (n.etat === 'retard')
    return <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-3 text-warning" />;
  if (n.etat !== 'erreur') return null;
  const stopped = n.type === 'outil' && n.conns.some((c) => c.creatorLeft);
  const Icon = stopped ? CircleStop : X;
  return <Icon aria-hidden="true" strokeWidth={2.2} className="size-3 text-destructive" />;
}

function Bulle({ n }: { n: Noeud }) {
  const t = useTranslations('connections');
  if (n.type === 'canal')
    return (
      <span className="block">
        <span className="block font-semibold text-fg">{n.label}</span>
        <span className="mt-0.5 block text-muted">{nb(n.detail)}</span>
      </span>
    );
  return (
    <span className="block">
      <span className="block font-semibold text-fg">{n.label}</span>
      {n.conns.map((c) => {
        const { word, icon: Icon, tone } = connState(c);
        return (
          <span key={c.id} className="mt-1 block">
            <span className="block text-fg-2">{c.label}</span>
            <span
              className={cn(
                'flex items-center gap-1',
                tone === 'destructive'
                  ? 'text-destructive'
                  : tone === 'success'
                    ? 'text-success'
                    : 'text-muted',
              )}
            >
              <Icon aria-hidden="true" strokeWidth={2} className="size-3" />
              {t(word)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// La pastille est centrée sur son point : son enveloppe (sans taille) est placée en %, elle se décale de moitié.
const PASTILLE =
  'absolute inline-flex h-8 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-line bg-menu px-3 ' +
  'text-[13px] font-medium whitespace-nowrap text-fg-2 outline-none hover:border-line-strong hover:text-fg ' +
  'focus-visible:shadow-[0_0_0_2px_var(--accent-line)] data-[hot]:border-line-strong data-[hot]:text-fg';

function Pastille({
  n,
  i,
  centre,
  hot,
  onHot,
  onOpen,
  instant,
  jeu,
}: {
  n: Noeud;
  i: number;
  centre: Centre;
  hot: boolean;
  onHot: (id: string | null) => void;
  onOpen: (id: ProviderId) => void;
  instant: boolean;
  jeu: boolean;
}) {
  const t = useTranslations('connections');
  // Les pastilles se penchent un peu vers le centre quand on le tire.
  const left = useTransform(centre.x, (x) => pct(n.x + (x - CX) * 0.05, W));
  const top = useTransform(centre.y, (y) => pct(n.y + (y - CY) * 0.05, H));
  const count = n.type === 'outil' && n.conns.length > 1 ? n.conns.length : null;
  const states =
    n.type === 'outil' ? n.conns.map((c) => t(connState(c).word)).join(', ') : n.detail;
  const props = {
    'data-hot': hot || undefined,
    'aria-label': nb(`${n.label} : ${states}`),
    onPointerEnter: () => onHot(n.id),
    onPointerLeave: () => onHot(null),
    onFocus: () => onHot(n.id),
    onBlur: () => onHot(null),
  };
  const inner = (
    <>
      <ToolIcon kind={n.type === 'outil' ? n.provider : n.channel} />
      {n.label}
      {count && <span className="font-mono text-[11px] text-muted">{count}</span>}
      <EtatIcone n={n} />
    </>
  );
  return (
    <motion.span
      className="absolute z-[2]"
      style={{ left, top }}
      inert={jeu}
      initial={instant ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 24,
        delay: instant ? 0 : 0.12 + i * 0.035,
      }}
    >
      <Tooltip content={<Bulle n={n} />} side={n.y < CY ? 'top' : 'bottom'}>
        {n.type === 'outil' ? (
          <button type="button" className={PASTILLE} onClick={() => onOpen(n.provider)} {...props}>
            {inner}
          </button>
        ) : (
          <Link href={n.to} className={PASTILLE} {...props}>
            {inner}
          </Link>
        )}
      </Tooltip>
    </motion.span>
  );
}

/** Le rond de Leon : on l'attrape, on le tire, il revient avec un rebond ; deux halos battent autour. */
function Coeur({
  centre,
  box,
  instant,
  jeu,
}: {
  centre: Centre;
  box: RefObject<HTMLDivElement | null>;
  instant: boolean;
  /** Pendant la partie, Leon suit la souris : on ne l'attrape plus. */
  jeu: boolean;
}) {
  const t = useTranslations('connections');
  const left = useTransform(centre.x, (x) => pct(x, W));
  const top = useTransform(centre.y, (y) => pct(y, H));
  const grab = useRef<{ px: number; py: number; x: number; y: number; k: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const down = (e: PointerEvent<HTMLSpanElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    centre.x.stop();
    centre.y.stop();
    grab.current = {
      px: e.clientX,
      py: e.clientY,
      x: centre.x.get(),
      y: centre.y.get(),
      k: W / r.width,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    const g = grab.current;
    if (!g) return;
    centre.x.set(clamp(g.x + (e.clientX - g.px) * g.k, 48, W - 48));
    centre.y.set(clamp(g.y + (e.clientY - g.py) * g.k, 48, H - 48));
  };
  const up = () => {
    if (!grab.current) return;
    grab.current = null;
    setDragging(false);
    if (instant) {
      centre.x.set(CX);
      centre.y.set(CY);
      return;
    }
    const spring = { type: 'spring', stiffness: 170, damping: 7, mass: 0.9 } as const;
    animate(centre.x, CX, spring);
    animate(centre.y, CY, spring);
  };

  return (
    <motion.span
      aria-hidden="true"
      style={{ left, top }}
      className="absolute z-[3] -translate-x-1/2 -translate-y-1/2"
    >
      <span className="cx-halo" />
      <span className="cx-halo cx-halo-2" />
      <motion.span
        title={jeu ? undefined : t('dragLeon')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        initial={instant ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: dragging ? 1.08 : 1, opacity: 1 }}
        whileHover={instant ? undefined : { scale: dragging ? 1.08 : 1.04 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18 }}
        className={cn(
          'relative grid size-[76px] touch-none place-items-center rounded-full border border-line-strong bg-menu shadow-float select-none',
          jeu ? 'pointer-events-none' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <Logo className="size-12" />
      </motion.span>
    </motion.span>
  );
}

function Legende() {
  const t = useTranslations('connections');
  const items: Array<[Etat, string]> = [
    ['actif', t('statusActive')],
    ['pause', t('statusPaused')],
    ['erreur', t('statusError')],
  ];
  return (
    <ul className="flex items-center gap-4 font-mono text-[11.5px] text-muted" aria-hidden="true">
      {items.map(([etat, label]) => {
        const s = STROKES[etat];
        return (
          <li key={etat} className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
              <line
                x1="1"
                y1="3"
                x2="21"
                y2="3"
                stroke={s.stroke}
                strokeWidth={s.width + 0.4}
                strokeDasharray={s.dash}
                strokeLinecap="round"
                opacity={Math.max(s.opacity, 0.8)}
              />
              {etat === 'actif' && <circle cx="15" cy="3" r="2" fill="var(--accent)" />}
            </svg>
            {label}
          </li>
        );
      })}
    </ul>
  );
}

export function CarteConnexions({
  catalog,
  conns,
  channels,
  stale,
  now,
  onOpen,
}: {
  catalog: CatalogItem[];
  conns: ConnectionView[];
  channels: ChannelHealth[];
  /** Les canaux en retard (staleChannels), par type. */
  stale: string[];
  now: Date;
  onOpen: (id: ProviderId) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('connections');
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const wide = useMinWidth(ref, 760);
  const instant = useInstant();
  const x = useMotionValue(CX);
  const y = useMotionValue(CY);
  // La traîne : un ressort plus mou qui suit le centre ; l'écart courbe les traits comme des tentacules.
  const lx = useSpring(x, { stiffness: 60, damping: 8 });
  const ly = useSpring(y, { stiffness: 60, damping: 8 });
  const centre = useMemo<Centre>(() => ({ x, y, lx, ly }), [x, y, lx, ly]);
  const [hot, setHot] = useState<string | null>(null);
  const list = useMemo(
    () => noeuds(catalog, conns, channels, stale, now, locale, t),
    [catalog, conns, channels, stale, now, locale, t],
  );
  const sources = useMemo(() => list.map((n) => ({ x: n.x, y: n.y })), [list]);
  const jeu = useJeu(centre, REPOS, instant);
  const { actif, quitter } = jeu;
  // Le schéma s'efface sous 760 px : la partie s'arrête avec lui.
  useEffect(() => {
    if (actif && !wide) quitter();
  }, [actif, wide, quitter]);
  const tools = list.filter((n) => n.type === 'outil').length;
  const lastSync = conns.reduce<Date | null>(
    (a, c) => (c.lastSyncAt && (!a || c.lastSyncAt > a) ? c.lastSyncAt : a),
    null,
  );
  const summary = [
    t('summary', { count: tools }),
    lastSync ? t('summaryLastSync', { time: formatSince(lastSync, now, locale) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div ref={ref} className={cn(wide && 'mb-10')}>
      {wide && (
        <GlassCard className="px-6 pt-5 pb-4">
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {actif ? (
              <HudJeu hud={jeu.hud} onReplay={jeu.lancer} onQuit={quitter} />
            ) : (
              <>
                <p className="flex items-center gap-2 font-mono text-[12px] text-muted tabular-nums">
                  <span
                    aria-hidden="true"
                    className="cx-live size-1.5 shrink-0 rounded-full bg-success"
                  />
                  {nb(summary)}
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <Legende />
                  <BoutonJeu ref={jeu.bouton} onClick={jeu.lancer} />
                </div>
              </>
            )}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: un groupe nommé de pastilles, pas un formulaire (fieldset) */}
          <div
            ref={box}
            role="group"
            aria-label={actif ? t('gameName') : t('graphLabel')}
            // la partie y met le focus : les flèches ne font plus défiler la page
            tabIndex={actif ? -1 : undefined}
            // plafonné : sur un grand écran, le schéma prenait toute la hauteur de la page
            className={cn(
              'relative mx-auto mt-2 w-full max-w-[760px] outline-none',
              actif && 'touch-none',
              actif && jeu.hud.phase !== 'fin' && 'cursor-none',
            )}
            style={{ aspectRatio: `${W} / ${H}` }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="absolute inset-0 size-full overflow-visible"
              aria-hidden="true"
            >
              {list.map((n, i) => (
                <Trait
                  key={n.id}
                  n={n}
                  i={i}
                  centre={centre}
                  hot={hot === n.id}
                  dim={hot !== null && hot !== n.id}
                  instant={instant}
                />
              ))}
            </svg>
            {actif && (
              <ToileJeu
                key={jeu.manche}
                centre={centre}
                box={box}
                sources={sources}
                instant={instant}
                onHud={jeu.setHud}
                onQuit={quitter}
              />
            )}
            {/* Les croix des traits en erreur ressemblent aux bugs du jeu : elles s'effacent le temps de la partie. */}
            {!actif &&
              list
                .filter((n) => n.etat === 'erreur')
                .map((n) => (
                  <Croix key={n.id} n={n} centre={centre} dim={hot !== null && hot !== n.id} />
                ))}
            {list.map((n, i) => (
              <Pastille
                key={n.id}
                n={n}
                i={i}
                centre={centre}
                hot={hot === n.id}
                onHot={setHot}
                onOpen={onOpen}
                instant={instant}
                jeu={actif}
              />
            ))}
            <Coeur centre={centre} box={box} instant={instant} jeu={actif} />
          </div>
        </GlassCard>
      )}
    </div>
  );
}
