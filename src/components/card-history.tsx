import { ChevronRight } from 'lucide-react';
import { FactRow } from '@/components/fact-row';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FactView } from '@/server/memory/card-data';

// Faits remplacés et terminés, repliés sous la fiche.
export function CardHistory({ facts }: { facts: FactView[] }) {
  if (facts.length === 0) return null;
  return (
    <Collapsible id="historique" className="mt-16 scroll-mt-24 border-t pt-6">
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="transition-transform duration-200 group-data-[state=open]:rotate-90"
        />
        Historique : {facts.length} {facts.length > 1 ? 'faits passés' : 'fait passé'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-6 space-y-8">
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} showPredicate />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
