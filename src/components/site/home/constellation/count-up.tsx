'use client';

import { useEffect, useRef, useState } from 'react';
import { isInstant } from '@/lib/verre/instant';

// Nombre qui compte jusqu'à sa valeur quand il entre dans l'écran (une fois). Rendu par le serveur à sa valeur finale :
// sans JavaScript, en mouvement réduit ou pour un lecteur d'écran (qui lit la valeur finale, sr-only), rien ne change.

export function CountUp({
  to,
  suffix = '',
  duration = 1400,
}: {
  to: number;
  /** Texte après le nombre (« min », « mots »). */
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || isInstant()) return;
    // pas encore vu : on repart de zéro, et on compte à l'entrée dans l'écran
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    setValue(0);
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / duration);
        // départ vif, arrivée douce
        setValue(Math.round(to * (1 - (1 - k) ** 4)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      <span className="sr-only">
        {to}
        {suffix && ` ${suffix}`}
      </span>
      <span aria-hidden="true" className="tabular-nums">
        {value}
        {suffix && <span className="ml-[0.18em] text-[0.62em] text-muted">{suffix}</span>}
      </span>
    </span>
  );
}
