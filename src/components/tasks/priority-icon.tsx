import type { ReactNode } from 'react';
import type { TaskPriority } from '@/lib/enums';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';

// Barres allumées : haute 3, moyenne 2, basse 1. Les autres barres restent en filigrane.
const BARS = { high: 3, medium: 2, low: 1 } as const;
const BAR_TOPS = [10, 7, 4];

function shape(priority: TaskPriority): ReactNode {
  if (priority === 'urgent') {
    return (
      <>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--warning)" />
        <path d="M8 4.8v4M8 11.2v.1" stroke="var(--card)" strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  }
  if (priority === 'none') {
    return (
      <path
        d="M2.5 8h2.5M6.75 8h2.5M11 8h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    );
  }
  return BAR_TOPS.map((top, index) => (
    <rect
      key={top}
      x={2 + index * 4.5}
      y={top}
      width="3"
      height={14 - top}
      rx="0.75"
      fill="currentColor"
      opacity={index < BARS[priority] ? 1 : 0.25}
    />
  ));
}

export function PriorityIcon({ priority }: { priority: TaskPriority }) {
  const label = PRIORITY_LABELS[priority];
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-label={label}
      className="shrink-0 text-foreground-2"
    >
      <title>{label}</title>
      {shape(priority)}
    </svg>
  );
}
