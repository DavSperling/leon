type LabelChipProps = { label: { name: string; color: string } };

// La couleur d'une étiquette est un choix de l'utilisateur, stocké en base : elle ne vient pas des jetons.
export function LabelDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${className ?? ''}`}
      style={{ backgroundColor: color }}
    />
  );
}

export function LabelChip({ label }: LabelChipProps) {
  return (
    <span className="inline-flex h-5 max-w-32 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs text-foreground-2">
      <LabelDot color={label.color} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
