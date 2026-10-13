import type { ReactNode } from 'react';

type EmptyStateProps = {
  reason: string; // pourquoi c'est vide
  nextStep: string; // quoi faire
  children?: ReactNode; // au plus un bouton
};

export function EmptyState({ reason, nextStep, children }: EmptyStateProps) {
  return (
    <div className="space-y-1 py-8">
      <p className="text-[15px] leading-6 font-medium">{reason}</p>
      <p className="text-[15px] leading-6 text-foreground-2">{nextStep}</p>
      {children && <div className="pt-3">{children}</div>}
    </div>
  );
}
