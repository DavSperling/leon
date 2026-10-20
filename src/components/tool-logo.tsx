import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/utils';

// Le logo d'un outil, posé sur une tuile blanche. Un fichier par outil dans public/logos/<id>.svg :
// tool-logo.test.ts refuse un outil du catalogue sans le sien.
export function ToolLogo({
  id,
  size = 40,
  className,
}: {
  id: ProviderId;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[10px] border bg-card shadow-xs',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* biome-ignore lint/performance/noImgElement: un SVG local de 1 Ko, rien à optimiser */}
      <img src={`/logos/${id}.svg`} alt="" width={size * 0.55} height={size * 0.55} />
    </span>
  );
}
