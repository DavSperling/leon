'use client';

import {
  ArrowLeftRight,
  CircleQuestionMark,
  Clock,
  type LucideIcon,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { resolveReviewAction } from '@/app/(app)/a-verifier/actions';
import { QuoteBlock } from '@/components/quote-block';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import type { ReviewResolution } from '@/server/memory/review-items';
import type { CardBrief, FactBrief, ReviewItemView } from '@/server/memory/review-list';

type Detail = ReviewItemView['detail'];
type Stored = NonNullable<ReviewItemView['resolution']>;

// Une réponse possible. `confirm` (libellé du bouton de confirmation) n'existe que pour les réponses
// qui élargissent l'audience : elles se confirment sur place et sont l'action principale.
export type ReviewAction = {
  label: string;
  resolution: ReviewResolution;
  confirm?: string;
  done: string; // toast de succès
};

const DECIDED = 'Décision enregistrée.';
const FAILURES = {
  introuvable: "Cet élément n'existe plus ou ne vous est pas visible.",
  deja_traite: 'Cet élément a déjà été traité.',
  incoherent: 'Les données ont changé depuis l’affichage. Actualisez la page.',
} as const;

export function actionsFor(detail: Detail): ReviewAction[] {
  switch (detail.kind) {
    case 'sensitive_fact':
      return [
        {
          label: 'Garder privé',
          resolution: { kind: 'sensitive_fact', decision: 'keep_private' },
          done: DECIDED,
        },
        {
          label: 'Partager',
          resolution: { kind: 'sensitive_fact', decision: 'share' },
          confirm: 'Confirmer le partage',
          done: 'Partage enregistré.',
        },
      ];
    case 'entity_match':
      return [
        {
          label: 'Non, garder deux fiches',
          resolution: { kind: 'entity_match', decision: 'different' },
          done: DECIDED,
        },
        {
          label: 'Oui, fusionner',
          resolution: { kind: 'entity_match', decision: 'same' },
          confirm: 'Confirmer la fusion',
          done: 'Fiches fusionnées.',
        },
      ];
    case 'proposed_type':
      return [
        {
          label: `Ranger sous ${detail.type.parentLabel}`,
          resolution: { kind: 'proposed_type', decision: 'use_parent' },
          done: DECIDED,
        },
        {
          label: 'Valider le type',
          resolution: { kind: 'proposed_type', decision: 'validate' },
          done: DECIDED,
        },
      ];
    case 'conflict':
      return [
        {
          label: 'Garder le premier',
          resolution: { kind: 'conflict', decision: 'keep_first' },
          done: DECIDED,
        },
        {
          label: 'Garder le second',
          resolution: { kind: 'conflict', decision: 'keep_second' },
          done: DECIDED,
        },
        {
          label: 'Les deux sont faux',
          resolution: { kind: 'conflict', decision: 'both_wrong' },
          done: DECIDED,
        },
      ];
  }
}

// Les décisions ont des noms distincts d'un type de question à l'autre : un libellé par décision.
const RESOLUTION_LABELS: Record<ReviewResolution['decision'], string> = {
  share: "Partagé avec l'équipe",
  keep_private: 'Gardé privé',
  same: 'Fiches fusionnées',
  different: 'Fiches gardées séparées',
  validate: 'Type validé',
  use_parent: 'Fiches rangées sous le type parent',
  keep_first: 'Premier fait gardé',
  keep_second: 'Second fait gardé',
  both_wrong: 'Les deux faits écartés',
};

export function resolutionLabel(resolution: Stored): string {
  if (resolution.kind === 'obsolete') return 'Devenu sans objet';
  return RESOLUTION_LABELS[resolution.decision];
}

const HEADS: Record<Detail['kind'], { icon: LucideIcon; label: string }> = {
  sensitive_fact: { icon: Clock, label: 'Fait sensible' },
  entity_match: { icon: CircleQuestionMark, label: 'Même entité ?' },
  proposed_type: { icon: Plus, label: 'Type proposé' },
  conflict: { icon: TriangleAlert, label: 'Contradiction' },
};

const countOf = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function CardLink({ id, title }: { id: string; title: string }) {
  return (
    <Link href={`/fiches/${id}`} className="text-primary hover:underline">
      {title}
    </Link>
  );
}

function Subject({ detail }: { detail: Detail }) {
  switch (detail.kind) {
    case 'sensitive_fact':
      return (
        <>
          {detail.categoryLabel && `${detail.categoryLabel} · `}
          <CardLink id={detail.cardId} title={detail.cardTitle} />
        </>
      );
    case 'entity_match':
      return null;
    case 'proposed_type':
      return (
        <>
          «&nbsp;{detail.type.label}&nbsp;» sous {detail.type.parentLabel} ·{' '}
          {countOf(detail.cardCount, 'fiche', 'fiches')}
        </>
      );
    case 'conflict':
      return (
        <>
          <CardLink id={detail.cardId} title={detail.cardTitle} /> · {detail.predicateLabel}
        </>
      );
  }
}

function FactBlock({ fact }: { fact: FactBrief }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[15px] leading-6">{fact.statement}</p>
      <QuoteBlock quote={fact.quote} />
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {fact.sourceKindLabel} · {fact.authorName} ·{' '}
        <time dateTime={fact.validFrom.toISOString()} className="tabular-nums">
          {formatDateTime(fact.validFrom)}
        </time>
      </p>
    </div>
  );
}

function CardBlock({ card }: { card: CardBrief }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[15px] leading-6 font-medium">
        <CardLink id={card.id} title={card.title} />
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {card.typeLabel} · {countOf(card.factCount, 'fait', 'faits')}
      </p>
      {card.firstFact && (
        <>
          <QuoteBlock quote={card.firstFact.quote} />
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {card.firstFact.sourceKindLabel}, {formatDate(card.firstFact.validFrom)}
          </p>
        </>
      )}
    </div>
  );
}

function Content({ detail }: { detail: Detail }) {
  switch (detail.kind) {
    case 'sensitive_fact':
      return <FactBlock fact={detail.fact} />;
    case 'entity_match':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-4">
          <CardBlock card={detail.newCard} />
          <ArrowLeftRight size={16} strokeWidth={1.5} aria-label="correspond peut-être à" />
          <CardBlock card={detail.candidateCard} />
        </div>
      );
    case 'proposed_type':
      return null;
    case 'conflict':
      return (
        <div className="grid grid-cols-2 gap-x-6">
          {detail.facts.map((fact, index) => (
            <div key={fact.id} className="space-y-1">
              <p className="text-[13px] leading-[18px] font-medium text-foreground-2">
                {index === 0 ? 'Premier fait' : 'Second fait'}
              </p>
              <FactBlock fact={fact} />
            </div>
          ))}
        </div>
      );
  }
}

function questionOf(detail: Detail): string {
  switch (detail.kind) {
    case 'sensitive_fact':
      return 'Seul vous le voyez. Le partager avec l’équipe ?';
    case 'entity_match':
      return 'Ces deux fiches désignent-elles la même entité ?';
    case 'proposed_type': {
      const { cardCount, type } = detail;
      const cards = cardCount === 1 ? 'sa fiche' : `ses ${cardCount} fiches`;
      return `Garder ce nouveau type, ou ranger ${cards} sous ${type.parentLabel} ?`;
    }
    case 'conflict':
      return 'Quel fait est juste ?';
  }
}

async function send(itemId: string, action: ReviewAction): Promise<boolean> {
  try {
    const result = await resolveReviewAction(itemId, action.resolution);
    if (result.ok) toast.success(action.done);
    else toast.error(FAILURES[result.reason]);
    return result.ok;
  } catch {
    toast.error('Impossible d’enregistrer. Réessayez.');
    return false;
  }
}

// Une réponse qui élargit l'audience passe par une confirmation sur place (sans minuterie ni
// dialogue) ; les autres partent au premier clic. Le focus suit le remplacement des boutons.
function ReviewActions({ itemId, detail }: { itemId: string; detail: Detail }) {
  const [choice, setChoice] = useState<ReviewAction | null>(null);
  const [pending, startTransition] = useTransition();
  const group = useRef<HTMLFieldSetElement>(null);
  const confirming = choice?.confirm ? choice : null;
  const previous = useRef(confirming);

  useEffect(() => {
    if (previous.current === confirming) return;
    previous.current = confirming;
    if (confirming) group.current?.querySelector('button')?.focus();
    else group.current?.focus();
  }, [confirming]);

  const submit = (action: ReviewAction) =>
    startTransition(async () => {
      if (!(await send(itemId, action))) setChoice(null);
    });
  const choose = (action: ReviewAction) => {
    setChoice(action);
    if (!action.confirm) submit(action);
  };
  const labelOf = (action: ReviewAction) =>
    pending && choice === action ? 'Envoi…' : action.label;

  return (
    <fieldset ref={group} tabIndex={-1} className="flex gap-2">
      <legend className="sr-only">Réponses</legend>
      {confirming ? (
        <>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setChoice(null)}>
            Annuler
          </Button>
          <Button size="sm" disabled={pending} onClick={() => submit(confirming)}>
            {pending ? 'Envoi…' : confirming.confirm}
          </Button>
        </>
      ) : (
        actionsFor(detail).map((action) => (
          <Button
            key={action.label}
            variant={action.confirm ? 'default' : 'outline'}
            size="sm"
            disabled={pending}
            onClick={() => choose(action)}
          >
            {labelOf(action)}
          </Button>
        ))
      )}
    </fieldset>
  );
}

function Outcome({ item }: { item: ReviewItemView }) {
  const { resolution, resolvedAt, resolvedByName } = item;
  return (
    <p className="text-[13px] leading-[18px] text-muted-foreground">
      {resolution && resolutionLabel(resolution)}
      {resolvedByName && resolution?.kind !== 'obsolete' && ` · par ${resolvedByName}`}
      {resolvedAt && (
        <>
          {' · '}
          <time dateTime={resolvedAt.toISOString()} className="tabular-nums">
            {formatDateTime(resolvedAt)}
          </time>
        </>
      )}
    </p>
  );
}

export function ReviewItemCard({ item }: { item: ReviewItemView }) {
  const { icon: Icon, label } = HEADS[item.detail.kind];
  return (
    <li className="space-y-3 border-b py-4">
      <div className="flex items-center gap-2 text-[13px] leading-[18px]">
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="text-foreground-2" />
        <h2 className="font-medium">{label}</h2>
        <p className="text-muted-foreground">
          <Subject detail={item.detail} />
        </p>
        {/* Âge relatif : le serveur et le navigateur peuvent différer d'une minute. */}
        <time
          dateTime={item.createdAt.toISOString()}
          title={formatDateTime(item.createdAt)}
          suppressHydrationWarning
          className="ml-auto text-muted-foreground tabular-nums"
        >
          {formatRelative(item.createdAt)}
        </time>
      </div>
      <Content detail={item.detail} />
      {item.status === 'open' ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm leading-5 text-foreground-2">{questionOf(item.detail)}</p>
          <ReviewActions itemId={item.id} detail={item.detail} />
        </div>
      ) : (
        <Outcome item={item} />
      )}
    </li>
  );
}
