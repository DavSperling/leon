import type { ReactNode } from 'react';
import { CopyButton } from '@/components/verre';

export const INLINE =
  'rounded-[6px] border border-line bg-glass-3 px-1.5 py-px font-mono text-[12.5px] tracking-normal whitespace-nowrap text-fg';
// Les sections défilent jusqu'à leur titre sous la barre mobile (56 px) ou en haut du panneau (/reglages#extension).
export const SECTION = 'mt-12 first:mt-0 scroll-mt-20 shell:scroll-mt-6';

const PLACEHOLDER = '<votre jeton>';

/**
 * La commande MCP, comme une CodeLine mais qui passe à la ligne : rien n'est caché, même à 390 px.
 * « <votre jeton> » ressort : c'est la seule chose à remplacer.
 */
export function CommandBlock({ command }: { command: string }) {
  const [before = '', after = ''] = command.split(PLACEHOLDER);
  const header = before.lastIndexOf('--header');
  // une option (« --header ») ne se coupe jamais après son premier tiret ; l'adresse, elle, peut se couper n'importe où
  const words = (s: string) =>
    s.split(/(--\S+)/).map((w, i) =>
      i % 2 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: découpage fixe d'une chaîne
        <span key={i} className="whitespace-nowrap">
          {w}
        </span>
      ) : (
        w
      ),
    );
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-field border border-line bg-glass-3 py-1.5 pr-1.5 pl-3.5">
      <code className="min-w-0 flex-1 py-1 text-[12.5px] leading-[1.7] tracking-normal whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-2">
        {words(before.slice(0, header))}
        {/* l'en-tête entre guillemets ne se coupe pas au milieu, sauf sur un écran étroit */}
        <span className="sm:whitespace-nowrap">
          {words(before.slice(header))}
          <span className="rounded-[4px] bg-mark-bg px-0.5 text-mark-ink">{PLACEHOLDER}</span>
          {after}
        </span>
      </code>
      <CopyButton value={command} />
    </div>
  );
}

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="mt-[1px] grid size-6 place-items-center rounded-full border border-line-strong font-mono text-[11px] tracking-normal text-fg-2"
      >
        {n}
      </span>
      <p className="text-body leading-[1.65] text-fg-2">
        <span className="sr-only">{n}. </span>
        {children}
      </p>
    </li>
  );
}
