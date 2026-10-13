'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { CardHistory } from '@/components/card-history';
import { FactRow } from '@/components/fact-row';
import { RawCard } from '@/components/raw-card';
import { StatusBadge } from '@/components/status-badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/format';
import { slugify } from '@/lib/slug';
import type { CardData, FactView } from '@/server/memory/card-data';

// Même ordre que le rendu Brut : prédicats par ordre alphabétique, le plus récent d'abord.
export function sortFacts(facts: FactView[]): FactView[] {
  return [...facts].sort(
    (a, b) =>
      a.predicateLabel.localeCompare(b.predicateLabel, 'fr') ||
      b.validFrom.getTime() - a.validFrom.getTime() ||
      a.id.localeCompare(b.id),
  );
}

type CardViewProps = { card: CardData; text: string; initialTab: 'fiche' | 'brut' };

export function CardView({ card, text, initialTab }: CardViewProps) {
  return (
    <Tabs defaultValue={initialTab} className="max-w-4xl gap-4 p-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Breadcrumb aria-label="Fil d'Ariane">
            <BreadcrumbList className="gap-1.5 font-mono text-xs leading-4 sm:gap-1.5">
              <BreadcrumbItem>{card.typeSlug}</BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{slugify(card.title)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            Lue {card.readCount} fois ·{' '}
            <Link
              href={`/journal?fiche=${card.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Journal
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </p>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl leading-7 font-semibold">{card.title}</h1>
            <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
              {card.typeLabel} · {card.factCount} {card.factCount > 1 ? 'faits' : 'fait'} · mis à
              jour le {formatDate(card.updatedAt)}
              {card.status === 'unconfirmed' && <StatusBadge status="unconfirmed" />}
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="fiche">Fiche</TabsTrigger>
            <TabsTrigger value="brut">Brut</TabsTrigger>
          </TabsList>
        </div>
      </header>
      <TabsContent value="fiche" className="border-t">
        <ul>
          {sortFacts(card.facts).map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </ul>
        <CardHistory facts={card.history} />
      </TabsContent>
      <TabsContent value="brut">
        <RawCard text={text} />
      </TabsContent>
    </Tabs>
  );
}
