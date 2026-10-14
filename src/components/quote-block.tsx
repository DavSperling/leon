'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// Citation littérale du tour source. Au-delà de trois lignes, elle est repliée.
export function QuoteBlock({ quote }: { quote: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const measure = (element: HTMLParagraphElement | null) => {
    if (element && !expanded) setOverflows(element.scrollHeight > element.clientHeight);
  };

  return (
    <div>
      <blockquote className="border-l-2 border-border pl-4 text-[15px] leading-6 text-muted-foreground">
        <p ref={measure} className={cn('whitespace-pre-line', !expanded && 'line-clamp-3')}>
          {`«\u00a0${quote}\u00a0»`}
        </p>
      </blockquote>
      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[13px] leading-[18px] text-primary hover:underline"
        >
          {expanded ? 'Réduire la citation' : 'Voir toute la citation'}
        </button>
      )}
    </div>
  );
}
