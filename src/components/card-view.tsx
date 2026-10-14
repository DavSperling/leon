'use client';

import { Code, FileText, History, Link2, ScanEye } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { CardHistory } from '@/components/card-history';
import { FactRow } from '@/components/fact-row';
import { RawCard } from '@/components/raw-card';
import { StatusBadge } from '@/components/status-badge';
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

async function copy(value: string, done: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(done);
  } catch {
    toast.error('Impossible de copier. Sélectionnez le texte à la main.');
  }
}

const TOOL_BUTTON =
  'inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3.5 text-[15px] text-foreground-2 shadow-xs transition-colors hover:bg-accent hover:text-foreground';
const ICON_BUTTON =
  'inline-flex size-10 items-center justify-center rounded-xl border bg-card text-foreground-2 shadow-xs transition-colors hover:bg-accent hover:text-foreground';

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-t">
      <th scope="row" className="w-52 border-r px-6 py-3.5 text-left align-top font-normal">
        {label}
      </th>
      <td className="px-6 py-3.5">{children}</td>
    </tr>
  );
}

type CardViewProps = { card: CardData; text: string; initialTab: 'fiche' | 'brut' };

export function CardView({ card, text, initialTab }: CardViewProps) {
  return (
    <Tabs defaultValue={initialTab} className="min-h-full gap-0">
      <div className="sticky top-0 z-10 flex h-[68px] items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          {card.history.length > 0 && (
            <a href="#historique" className={TOOL_BUTTON}>
              <History size={18} strokeWidth={1.5} aria-hidden="true" />
              Historique
              <span className="text-muted-foreground tabular-nums">{card.history.length}</span>
            </a>
          )}
          <Link href={`/journal?fiche=${card.id}`} className={TOOL_BUTTON}>
            <ScanEye size={18} strokeWidth={1.5} aria-hidden="true" />
            Journal de lecture
            <span className="text-muted-foreground tabular-nums">{card.readCount}</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            title="Copier le lien de la fiche"
            aria-label="Copier le lien de la fiche"
            onClick={() => copy(window.location.href.split('?')[0] ?? '', 'Lien copié.')}
            className={ICON_BUTTON}
          >
            <Link2 size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <TabsList className="h-10 rounded-xl bg-muted p-1">
            <TabsTrigger
              value="fiche"
              title="Fiche"
              className="h-8 w-10 flex-none rounded-lg px-0 data-[state=active]:shadow-sm"
            >
              <FileText size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only">Fiche</span>
            </TabsTrigger>
            <TabsTrigger
              value="brut"
              title="Brut : ce que reçoit un assistant"
              className="h-8 w-10 flex-none rounded-lg px-0 data-[state=active]:shadow-sm"
            >
              <Code size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only">Brut</span>
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      <article className="mx-auto w-full max-w-[880px] px-12 pt-16 pb-32 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
        <header className="border-b pb-8">
          <h1 className="text-[36px] leading-[44px] font-semibold tracking-[-0.02em] text-balance">
            {card.title}
            <span className="font-normal text-muted-foreground/70"> · {card.typeLabel}</span>
          </h1>
        </header>
        <TabsContent value="fiche" className="text-[17px] leading-8">
          <div className="mt-10 overflow-hidden rounded-xl border">
            <table className="w-full border-collapse text-base">
              <thead className="bg-muted/70">
                <tr>
                  <th scope="col" className="w-52 border-r px-6 py-3.5 text-left font-semibold">
                    Propriété
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-left font-semibold">
                    Valeur
                  </th>
                </tr>
              </thead>
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
                  {formatNumber(card.readCount)} {card.readCount > 1 ? 'lectures' : 'lecture'} par
                  un assistant ou l'interface
                </SummaryRow>
              </tbody>
            </table>
          </div>
          {groupByPredicate(card.facts).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mt-14 mb-5 text-[28px] leading-9 font-semibold tracking-[-0.02em]">
                {group.label}
              </h2>
              <ul className="space-y-9">
                {group.facts.map((fact) => (
                  <FactRow key={fact.id} fact={fact} />
                ))}
              </ul>
            </section>
          ))}
          <CardHistory facts={card.history} />
        </TabsContent>
        <TabsContent value="brut" className="mt-10">
          <RawCard text={text} />
        </TabsContent>
      </article>
    </Tabs>
  );
}
