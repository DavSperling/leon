import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/verre/cn';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';
// La pastille d'état : un point et quelques mots. success : le point vert d'un état sain ; destructive : ce qui ne va
// pas ; warning : en cours (ambre). neutral, accent et info : les mots seuls.
const TONES: Record<Tone, { cls: string; dot?: string }> = {
  neutral: { cls: 'bg-selected text-fg' },
  accent: { cls: 'bg-selected text-fg' },
  info: { cls: 'bg-selected text-fg' },
  success: { cls: 'bg-selected text-fg', dot: 'bg-ok' },
  warning: { cls: 'bg-m4 text-fg', dot: 'bg-f4' },
  destructive: { cls: 'bg-destructive-soft text-destructive', dot: 'bg-destructive' },
};

export type BadgeProps = ComponentProps<'span'> & {
  tone?: Tone;
  /** Plus dessinée : un état se dit par son point. La prop reste pour ses appelants. */
  icon?: LucideIcon;
  /** Sans effet : le mono est réservé au vrai code. */
  mono?: boolean;
  /** tone="warning" : le fond ambre arrive une fois (une action en cours). */
  sweeping?: boolean;
};

/** Pastille d'état (24 px) : « Synchronisé », « Déconnecté », « Première synchronisation en cours ». Dans un panneau, jamais sur une carte. */
export function Badge({
  tone = 'neutral',
  icon: _icon,
  mono: _mono,
  sweeping,
  className,
  children,
  ...props
}: BadgeProps) {
  const t = TONES[tone];
  const sweep = sweeping && tone === 'warning';
  return (
    <span
      className={cn(
        'relative z-0 inline-flex h-6 shrink-0 items-center gap-1.5 overflow-hidden rounded-full pr-[9px] pl-2 text-label leading-none font-medium whitespace-nowrap',
        t.cls,
        // dans la ligne d'état d'un panneau (StatusRow), une pastille sans teinte se lit nue
        t.cls.startsWith('bg-selected') && '[.statusrow>&]:bg-transparent [.statusrow>&]:pl-0',
        sweep && 'pill-sweep bg-selected',
        className,
      )}
      {...props}
    >
      {t.dot && <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}
