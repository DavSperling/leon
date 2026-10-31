'use client';

import { useEffect, useRef } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';
import { toolLabel } from '../content';
import { ToolLogo } from '../parts';

// Sphère des outils en 3D : chaque logo sur une sphère de Fibonacci, qui tourne seule et se lance au doigt ou à la
// souris (avec de l'élan). Profondeur rendue par la taille, l'opacité et l'ordre d'empilement ; Leon au centre.
// Seuls transform et opacity changent à chaque image (l'ordre, par tranches, ne change qu'en passant une tranche).
// En pause hors de l'écran ; figée en mouvement réduit ou quand les animations sont arrêtées.
// Les lecteurs d'écran lisent la liste des outils (sr-only), pas la sphère.

const fibonacci = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r };
  });

export function LogoSphere({
  tools,
  size = 34,
  srList = true,
  className,
}: {
  tools: ProviderId[];
  /** Liste des outils pour les lecteurs d'écran ; false quand la page les liste déjà en texte. */
  srList?: boolean;
  /** Taille d'un logo au premier plan, en px. */
  size?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const items = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const points = fibonacci(tools.length);
    let radius = 0;
    let ax = -0.35;
    let ay = 0;
    let vx = 0;
    let vy = 0.0032;
    let raf = 0;
    let visible = true;
    let running = false;
    let drag: { x: number; y: number; t: number } | null = null;

    // petite sphère (mobile) : les logos rapetissent avec elle, sinon ils se chevauchent
    let fit = 1;
    const measure = () => {
      radius = el.clientWidth * 0.4;
      fit = Math.min(1, Math.max(0.6, el.clientWidth / 540));
    };

    const render = () => {
      const cx = Math.cos(ax);
      const sx = Math.sin(ax);
      const cy = Math.cos(ay);
      const sy = Math.sin(ay);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const node = items.current[i];
        if (!p || !node) continue;
        // rotation autour de Y, puis de X
        const x1 = p.x * cy + p.z * sy;
        const z1 = -p.x * sy + p.z * cy;
        const y2 = p.y * cx - z1 * sx;
        const z2 = p.y * sx + z1 * cx;
        const depth = (z2 + 1) / 2; // 0 au fond, 1 devant
        const scale = (0.55 + depth * 0.6) * fit;
        node.style.transform = `translate3d(${(x1 * radius).toFixed(1)}px, ${(y2 * radius).toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        node.style.opacity = (0.18 + depth * 0.82).toFixed(3);
        node.style.zIndex = String(Math.round(depth * 4) * 25);
      }
    };

    const loop = () => {
      if (isInstant()) {
        pause();
        return;
      }
      if (!drag) {
        ay += vy;
        ax += vx;
        // l'élan retombe vers la rotation de croisière
        vy += (0.0032 - vy) * 0.02;
        vx += (0 - vx) * 0.04;
        ax += (-0.35 - ax) * 0.01;
      }
      render();
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || isInstant() || !visible || document.hidden) return;
      running = true;
      el.dataset.running = '';
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      delete el.dataset.running;
      cancelAnimationFrame(raf);
    };

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      el.dataset.dragging = '';
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const dt = Math.max(16, performance.now() - drag.t);
      ay += dx * 0.008;
      ax -= dy * 0.008;
      vy = (dx * 0.008 * 16) / dt;
      vx = (-dy * 0.008 * 16) / dt;
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (!running) render();
    };
    const up = (e: PointerEvent) => {
      drag = null;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    measure();
    render();
    play();
    const ro = new ResizeObserver(() => {
      measure();
      render();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) play();
      else pause();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    // « Arrêter les animations » : on s'arrête ou on repart
    const mo = new MutationObserver(() => (isInstant() ? pause() : play()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [tools]);

  return (
    <div className={cn('relative aspect-square w-full', className)}>
      {srList && (
        <ul className="sr-only">
          {tools.map((id) => (
            <li key={id}>{toolLabel(id)}</li>
          ))}
        </ul>
      )}
      <div ref={host} aria-hidden="true" className="fx-sphere absolute inset-0 select-none">
        {/* halo et Leon au centre */}
        <div className="absolute inset-[30%] rounded-full bg-[radial-gradient(closest-side,var(--accent-soft),transparent)] fx-breathe" />
        <div className="absolute top-1/2 left-1/2 z-[50] -translate-x-1/2 -translate-y-1/2">
          <span className="site-ping absolute inset-0 rounded-full border border-accent-line" />
          <span className="site-ping site-ping-2 absolute inset-0 rounded-full border border-accent-line" />
          <span className="relative grid size-16 place-items-center rounded-full bg-menu shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_0_0_1px_var(--line-strong),0_24px_60px_-14px_color-mix(in_srgb,var(--accent)_75%,transparent)]">
            <Logo className="size-11" />
          </span>
        </div>
        {tools.map((id, i) => (
          <div
            key={id}
            ref={(node) => {
              items.current[i] = node;
            }}
            className="fx-sphere-item"
            // placés par l'effet à la première image : rien ne s'empile au centre avant
            style={{ opacity: 0 }}
          >
            <ToolLogo id={id} size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
