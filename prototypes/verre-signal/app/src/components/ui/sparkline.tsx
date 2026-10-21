import { cn } from '@/lib/cn';

/** Barres d'activité de la planche, sans animation ; la dernière (aujourd'hui) plus franche. Donnez `label` (lu) : le sens ne passe pas que par le dessin. */
export function Sparkline({ values, label, className }: { values: number[]; /** résumé pour les lecteurs d'écran */ label?: string; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn('spark flex h-6 items-end gap-[2px]', className)}>
      {values.map((v, i) => <i key={i} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />)}
    </div>
  );
}
