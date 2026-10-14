import type { ReactNode } from 'react';

type EmptyStateProps = {
  reason: string; // pourquoi c'est vide
  nextStep: string; // quoi faire
  children?: ReactNode; // au plus un bouton
};

export function EmptyState({ reason, nextStep, children }: EmptyStateProps) {
  return (
    <div className="space-y-1 py-10">
      <p className="text-base leading-7 font-medium">{reason}</p>
      <p className="text-base leading-7 text-muted-foreground">{nextStep}</p>
      {children && <div className="pt-3">{children}</div>}
    </div>
  );
}
