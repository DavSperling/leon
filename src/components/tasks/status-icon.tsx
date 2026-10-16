import type { ReactNode } from 'react';
import type { TaskStatusCategory } from '@/lib/enums';

const STROKE = 1.5;

// La forme dit la catégorie, la couleur dit le statut : l'une ne remplace jamais l'autre.
const SHAPES = {
  backlog: (color) => (
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke={color}
      strokeWidth={STROKE}
      strokeDasharray="2 1.77"
      fill="none"
    />
  ),
  todo: (color) => <circle cx="8" cy="8" r="6" stroke={color} strokeWidth={STROKE} fill="none" />,
  started: (color) => (
    <>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth={STROKE} fill="none" />
      <path d="M8 4a4 4 0 0 1 0 8z" fill={color} />
    </>
  ),
  done: (color) => (
    <>
      <circle cx="8" cy="8" r="7" fill={color} />
      <path
        d="M5 8.2l2 2 4-4.2"
        stroke="var(--card)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  canceled: (color) => (
    <>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth={STROKE} fill="none" />
      <path
        d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
} as const satisfies Record<TaskStatusCategory, (color: string) => ReactNode>;

type StatusIconProps = { category: TaskStatusCategory; color: string; label?: string };

// `label` en fait une image nommée ; sans lui, l'icône est décorative (le libellé est à côté).
export function StatusIcon({ category, color, label }: StatusIconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      {label && <title>{label}</title>}
      {SHAPES[category](color)}
    </svg>
  );
}
