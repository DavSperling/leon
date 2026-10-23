'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';

// Champ de particules en 3D : une nappe de points vue en perspective, soulevée par des ondes lentes, dans les couleurs
// du thème (accent → sarcelle). Canvas 2D, sans dépendance. Le pointeur décale doucement la caméra. En pause hors de
// l'écran et quand l'onglet est caché ; une seule image en mouvement réduit.

type Rgb = [number, number, number];

const hexToRgb = (value: string, fallback: Rgb): Rgb => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value.trim());
  return m
    ? [
        Number.parseInt(m[1] ?? '0', 16),
        Number.parseInt(m[2] ?? '0', 16),
        Number.parseInt(m[3] ?? '0', 16),
      ]
    : fallback;
};

const COLOR_STEPS = 6;
const ALPHA_STEPS = 8;
const NEAR = 1.1;
const FAR = 10;

export function ParticleField({
  className,
  density = 1,
  height = 1.15,
}: {
  className?: string;
  /** 1 : la nappe complète ; moins pour un fond plus léger. */
  density?: number;
  /** Hauteur de la caméra au-dessus de la nappe (plus haut : on la voit davantage de dessus). */
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let heightPx = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let styles: string[] = [];
    let light = false;
    // une liste de points par style (couleur × opacité), réutilisée à chaque image
    let buckets: number[][] = [];
    let raf = 0;
    let visible = true;
    let running = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const start = performance.now();

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      light = document.documentElement.dataset.theme === 'light';
      const a = hexToRgb(cs.getPropertyValue('--accent'), [170, 191, 242]);
      const b = hexToRgb(cs.getPropertyValue('--logo-2'), [109, 180, 169]);
      styles = [];
      for (let c = 0; c < COLOR_STEPS; c++) {
        const k = c / (COLOR_STEPS - 1);
        const rgb = a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * k));
        for (let s = 0; s < ALPHA_STEPS; s++) {
          const alpha = ((s + 1) / ALPHA_STEPS) * 0.9;
          styles.push(`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`);
        }
      }
      buckets = styles.map(() => []);
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = r.width;
      heightPx = r.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(heightPx * dpr));
      const small = width < 640;
      cols = Math.round((small ? 64 : 118) * density);
      rows = Math.round((small ? 34 : 44) * density);
      draw(performance.now());
    };

    const draw = (now: number) => {
      const t = isInstant() ? 0 : (now - start) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, heightPx);
      for (const b of buckets) b.length = 0;

      const f = Math.min(width, heightPx * 1.6) * 0.62;
      const horizon = heightPx * 0.3 + pointer.y * 14;
      const camX = pointer.x * 0.55;
      const spanX = 7.5;
      const amp = 0.5;
      for (let j = 0; j < rows; j++) {
        // plus de rangées au loin : la nappe garde sa densité apparente
        const zr = j / (rows - 1);
        const z = NEAR + (FAR - NEAR) * zr ** 1.35;
        const depth = 1 - (z - NEAR) / (FAR - NEAR);
        for (let i = 0; i < cols; i++) {
          const x = -spanX + (2 * spanX * i) / (cols - 1);
          const y =
            amp * Math.sin(x * 0.75 + t * 0.55) * Math.cos(z * 0.62 - t * 0.35) +
            amp * 0.55 * Math.sin((x - z) * 1.15 + t * 0.8) +
            amp * 0.25 * Math.cos(x * 2.1 - t * 0.45 + z);
          const sx = width / 2 + ((x - camX) / z) * f;
          if (sx < -4 || sx > width + 4) continue;
          const sy = horizon + ((height - y) / z) * f;
          if (sy < -4 || sy > heightPx + 4) continue;
          const crest = Math.min(1, Math.max(0, (y + amp) / (2 * amp)));
          const alpha = (0.18 + 0.82 * depth ** 0.9) * (0.45 + 0.55 * crest);
          const s = Math.min(ALPHA_STEPS - 1, Math.floor(alpha * ALPHA_STEPS));
          if (s < 0) continue;
          const c = Math.min(COLOR_STEPS - 1, Math.floor((i / cols) * COLOR_STEPS));
          const bucket = buckets[c * ALPHA_STEPS + s];
          if (!bucket) continue;
          const size = Math.max(1.1, (4.4 / z) * (0.7 + crest * 0.6));
          bucket.push(sx, sy, size);
        }
      }
      // en sombre, les points s'additionnent (lueur) ; en clair, ils se posent simplement
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      for (let k = 0; k < buckets.length; k++) {
        const b = buckets[k];
        if (!b || b.length === 0) continue;
        ctx.fillStyle = styles[k] ?? '#fff';
        // des points ronds, tracés d'un seul chemin par style
        ctx.beginPath();
        for (let p = 0; p < b.length; p += 3) {
          const x = b[p] ?? 0;
          const y = b[p + 1] ?? 0;
          const r = (b[p + 2] ?? 1) / 2;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || isInstant() || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    readColors();
    resize();
    play();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) play();
      else pause();
    });
    io.observe(canvas);
    // le thème change : nouvelles couleurs
    const mo = new MutationObserver(() => {
      readColors();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [density, height]);

  return (
    <div aria-hidden="true" className={cn('fx-field size-full', className)}>
      <canvas ref={ref} className="block size-full" />
    </div>
  );
}
