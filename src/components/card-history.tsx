import { ChevronRight } from 'lucide-react';
import { FactRow } from '@/components/fact-row';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FactView } from '@/server/memory/card-data';

// Faits remplacés et terminés, repliés sous la fiche.
export function CardHistory({ facts }: { facts: FactView[] }) {
  if (facts.length === 0) return null;
  return (
    <Collapsible className="mt-4">
      <CollapsibleTrigger className="group flex items-center gap-1 text-[13px] leading-[18px] text-muted-foreground hover:text-foreground">
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="group-data-[state=open]:rotate-90"
        />
        Historique : {facts.length} {facts.length > 1 ? 'faits passés' : 'fait passé'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul>
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
