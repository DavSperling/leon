import { CircleCheck, CircleX, Info, type LucideIcon, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { spring, unfilter } from '@/lib/motion';
import { nb } from '@/lib/nb';

// Notifications : un petit magasin global, toast('Copié.') depuis n'importe où ; <Toaster /> est monté dans l'ossature.
// Le minuteur s'arrête tant que le pointeur ou le focus est sur la pile ; une erreur reste 8 s au lieu de 4.

type Tone = 'default' | 'success' | 'error';
type Item = { id: number; message: string; tone: Tone };
let items: Item[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Temps restant de chaque notification, et minuteur en cours (absent pendant la pause).
const clocks = new Map<number, { left: number; since: number; timer?: ReturnType<typeof setTimeout> }>();
let paused = false;

function dismiss(id: number) {
  clearTimeout(clocks.get(id)?.timer);
  clocks.delete(id);
  items = items.filter((t) => t.id !== id);
  if (!items.length) paused = false; // la pile vide ne retient plus de pause (pointeur resté immobile)
  emit();
}

function run(id: number) {
  const c = clocks.get(id);
  if (!c || paused) return;
  c.since = Date.now();
  c.timer = setTimeout(() => dismiss(id), c.left);
}

function setPaused(on: boolean) {
  if (paused === on) return;
  paused = on;
  for (const [id, c] of clocks) {
    if (on) (clearTimeout(c.timer), (c.timer = undefined), (c.left = Math.max(800, c.left - (Date.now() - c.since))));
    else run(id);
  }
}

function push(message: string, tone: Tone = 'default', duration = tone === 'error' ? 8000 : 4000): number {
  const id = next++;
  const kept = [...items, { id, message: nb(message), tone }].slice(-3); // trois au plus à l'écran
  for (const t of items) if (!kept.includes(t)) (clearTimeout(clocks.get(t.id)?.timer), clocks.delete(t.id));
  items = kept;
  clocks.set(id, { left: duration, since: Date.now() });
  run(id);
  emit();
  return id;
}

/** toast('Copié.') ; toast.success('Jeton révoqué.') ; toast.error('Impossible de révoquer. Réessayez.') (8 s) */
export const toast = Object.assign((message: string, duration?: number) => push(message, 'default', duration), {
  success: (message: string, duration?: number) => push(message, 'success', duration),
  error: (message: string, duration?: number) => push(message, 'error', duration),
  dismiss,
});

const ICONS: Record<Tone, { icon: LucideIcon; cls: string }> = {
  default: { icon: Info, cls: 'text-accent' },
  success: { icon: CircleCheck, cls: 'text-success' },
  error: { icon: CircleX, cls: 'text-destructive' },
};

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <>
      {/* Région annoncée : les messages seuls (sans les boutons « Fermer »), présente dès le chargement. */}
      <div role="status" aria-live="polite" className="sr-only">
        {list.map((t) => <p key={t.id}>{t.message}</p>)}
      </div>
      <div
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPaused(false)}
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {list.map((t) => {
            const { icon: Icon, cls } = ICONS[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { ...spring, opacity: { duration: 0.2 } }, transitionEnd: unfilter }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
                className="glass-float pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-card border border-line-strong py-3 pr-2 pl-3.5 text-ui text-fg shadow-float"
              >
                <Icon aria-hidden="true" strokeWidth={1.8} className={cn('mt-[2px] size-4 shrink-0', cls)} />
                <p aria-hidden="true" className="min-w-0 flex-1 py-px">{t.message}</p>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Fermer la notification" className="-my-1 grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg">
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
