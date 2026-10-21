import { isInstant } from './instant';

/** Attend `ms` ; immédiat en mode instantané ; se résout tôt (false) si `signal` est interrompu. */
export function wait(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (isInstant() || ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onAbort = () => (clearTimeout(t), resolve(false));
    const t = setTimeout(() => (signal?.removeEventListener('abort', onAbort), resolve(true)), ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type StreamOptions = {
  /** Reçoit chaque morceau (mot, espace ou renvoi « [n] ») et le texte accumulé. */
  onToken: (token: string, text: string) => void;
  signal?: AbortSignal;
  /** Tout d'un coup ; par défaut, le mode instantané. */
  instant?: boolean;
  /** Pause avant le premier mot, en ms (le temps que Leon « réfléchisse »). */
  delay?: number;
};

// Pseudo-aléa à graine : le même texte s'écrit toujours au même rythme.
const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

/**
 * Écrit `text` mot à mot avec un rythme réaliste (20 à 70 ms par mot, pause après la ponctuation). Un rendu qui
 * redécoupe le texte doit couper sur [ \t\n]+ (pas \s+, qui casserait les espaces insécables de nb()).
 * Se résout en 'done', ou 'aborted' si le signal est interrompu en route.
 */
export async function simulateStream(text: string, opts: StreamOptions): Promise<'done' | 'aborted'> {
  const instant = opts.instant ?? isInstant();
  // coupé sur les espaces ordinaires seulement : « 15 % », « fin ? » (espaces insécables de nb()) arrivent d'un bloc
  const tokens = text.match(/\[\d+\]|[ \t\n]+|[^ \t\n[]+|\[/g) ?? [];
  if (instant) {
    if (opts.signal?.aborted) return 'aborted';
    opts.onToken(text, text);
    return 'done';
  }
  if (opts.delay && !(await wait(opts.delay, opts.signal))) return 'aborted';
  let acc = '';
  for (const [i, token] of tokens.entries()) {
    if (opts.signal?.aborted) return 'aborted';
    acc += token;
    opts.onToken(token, acc);
    if (/^[ \t\n]+$/.test(token)) continue;
    const pause = /[.!?…]$/.test(token) ? 180 : /[,;:]$/.test(token) ? 90 : 0;
    if (!(await wait(20 + jitter(i) * 50 + pause, opts.signal))) return 'aborted';
  }
  return 'done';
}
