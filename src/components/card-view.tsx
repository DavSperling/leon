'use client';

import { ArrowRight, Code, FileText } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
import { formatDate, formatNumber } from '@/lib/format';
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

// Une section par prédicat, dans l'ordre de `sortFacts`.
export function groupByPredicate(facts: FactView[]): Array<{ label: string; facts: FactView[] }> {
  const groups: Array<{ label: string; facts: FactView[] }> = [];
  for (const fact of sortFacts(facts)) {
    const last = groups.at(-1);
    if (last?.label === fact.predicateLabel) last.facts.push(fact);
    else groups.push({ label: fact.predicateLabel, facts: [fact] });
  }
  return groups;
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <th
        scope="row"
        className="w-44 bg-muted/60 px-5 py-3 text-left align-top text-[15px] leading-6 font-medium"
      >
        {label}
      </th>
      <td className="px-5 py-3 text-[15px] leading-6">{children}</td>
    </tr>
  );
}

type CardViewProps = { card: CardData; text: string; initialTab: 'fiche' | 'brut' };

export function CardView({ card, text, initialTab }: CardViewProps) {
  return (
    <Tabs defaultValue={initialTab} className="gap-0">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-card/85 px-5 backdrop-blur">
        <Breadcrumb aria-label="Fil d'Ariane" className="min-w-0">
          <BreadcrumbList className="flex-nowrap gap-1.5 text-sm text-muted-foreground sm:gap-1.5">
            <BreadcrumbItem className="shrink-0">{card.typeLabel}</BreadcrumbItem>
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{card.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <TabsList className="h-9 shrink-0 rounded-lg p-1">
          <TabsTrigger value="fiche" className="gap-1.5 rounded-md px-2.5">
            <FileText size={15} strokeWidth={1.5} aria-hidden="true" />
            Fiche
          </TabsTrigger>
          <TabsTrigger value="brut" className="gap-1.5 rounded-md px-2.5">
            <Code size={15} strokeWidth={1.5} aria-hidden="true" />
            Brut
          </TabsTrigger>
        </TabsList>
      </div>
      <article className="mx-auto w-full max-w-[780px] px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
        <header className="border-b pb-7">
          <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight text-balance">
            {card.title}
          </h1>
        </header>
        <TabsContent value="fiche" className="text-base">
          <div className="mt-8 overflow-hidden rounded-xl border">
            <table className="w-full border-collapse">
              <tbody>
                <SummaryRow label="Type">{card.typeLabel}</SummaryRow>
                <SummaryRow label="Statut">
                  {card.status === 'unconfirmed' ? (
                    <StatusBadge status="unconfirmed" />
                  ) : (
                    'Confirmée'
                  )}
                </SummaryRow>
                <SummaryRow label="Faits">{formatNumber(card.factCount)}</SummaryRow>
                <SummaryRow label="Mise à jour">{formatDate(card.updatedAt)}</SummaryRow>
                <SummaryRow label="Lectures">
                  Lue {formatNumber(card.readCount)} fois ·{' '}
                  <Link
                    href={`/journal?fiche=${card.id}`}
                    className="inline-flex items-center gap-1 text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
                  >
                    Journal
                    <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </SummaryRow>
              </tbody>
            </table>
          </div>
          {groupByPredicate(card.facts).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mt-12 mb-5 text-2xl leading-8 font-semibold tracking-tight">
                {group.label}
              </h2>
              <ul className="space-y-8">
                {group.facts.map((fact) => (
                  <FactRow key={fact.id} fact={fact} />
                ))}
              </ul>
            </section>
          ))}
          <CardHistory facts={card.history} />
        </TabsContent>
        <TabsContent value="brut" className="mt-8">
          <RawCard text={text} />
        </TabsContent>
      </article>
    </Tabs>
  );
}
