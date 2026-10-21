import { ChevronRight, Lock, MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button, EmptyState, Field, GlassCard, Notice, PageHeader, Section, Textarea, trackSpot, useThinking } from '@/components';
import { CORPUS, createDiscussion, useDiscussions } from '@/data';
import { cn, formatNumber, formatRelative, nb, wait } from '@/lib';
import { MAX_CHARS, NO_MODEL } from './model';

// Liste des discussions : en-tête, avertissement sans modèle, nouvelle question, « Vos discussions ».

const ERRORS = {
  longue: nb('Écrivez une question de 4 000 caractères au plus.'),
  creation: nb('La discussion n’a pas pu être créée. Réessayez dans un instant.'),
} as const;
type ErrorKey = keyof typeof ERRORS;
const HELP = 'Leon cherche, lit et répond en citant ses sources.';
/** Une question collée trop longue (démonstration de ?erreur=longue) : quelques caractères de trop. */
const LONG_PASTE = CORPUS.flatMap((i) => i.turns.map((t) => t.text)).join(' ').slice(0, MAX_CHARS + 12);

function NewDiscussion({ disabled, focusKey, demoError }: { disabled: boolean; focusKey: string | null; demoError: ErrorKey | null }) {
  const navigate = useNavigate();
  const { setThinking } = useThinking();
  const field = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState(demoError === 'longue' ? LONG_PASTE : demoError === 'creation' ? 'Où en est le recrutement du développeur backend ?' : '');
  const [error, setError] = useState<ErrorKey | null>(demoError);
  const [pending, setPending] = useState(false);

  // ?nouvelle=1 (action « Nouvelle discussion » de ⌘K) : le curseur va dans la question, même si la page est déjà ouverte.
  useEffect(() => {
    if (!focusKey) return;
    field.current?.focus();
    // la palette garde le focus pendant sa sortie (piège Radix) : on le reprend une fois qu'elle est partie
    const t = setTimeout(() => document.activeElement !== field.current && field.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [focusKey]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (disabled || pending) return;
    const q = question.trim();
    if (!q) return field.current?.focus();
    if (q.length > MAX_CHARS) return setError('longue');
    setError(null);
    setPending(true);
    setThinking(true);
    await wait(300); // le temps de créer la discussion, pas plus
    const d = createDiscussion(q);
    navigate(`/discussions/${d.id}`);
  }

  const count = question.length;
  return (
    <GlassCard variant="raised" signal className="p-4 sm:p-5">
      <form onSubmit={submit} noValidate>
        <Field
          label={<span className="text-body text-fg">Nouvelle discussion</span>}
          aside={count >= MAX_CHARS * 0.9 && <span className={cn('font-mono text-meta tracking-normal', count > MAX_CHARS ? 'text-destructive' : 'text-muted')}>{formatNumber(count)} / {formatNumber(MAX_CHARS)}</span>}
        >
          <Textarea
            ref={field}
            name="question"
            rows={3}
            autoGrow
            maxRows={10}
            maxLength={MAX_CHARS}
            required
            value={question}
            onChange={(e) => (setQuestion(e.target.value), error === 'longue' && e.target.value.length <= MAX_CHARS && setError(null))}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void submit()}
            disabled={disabled}
            readOnly={pending} // et non disabled : le focus reste dans le champ pendant l'envoi (⌘ + Entrée)
            aria-invalid={error === 'longue' || undefined} // un échec de création ne vient pas de la question
            aria-describedby="nouvelle-question-note"
            placeholder={nb('Par exemple : qu’a-t-on décidé avec ACME sur le renouvellement du contrat ?')}
            className="min-h-[92px] text-lead"
          />
        </Field>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {error ? (
            <p id="nouvelle-question-note" role="alert" className="text-ui text-destructive">{ERRORS[error]}</p>
          ) : (
            // le sous-titre le dit déjà : lu, pas affiché
            <p id="nouvelle-question-note" className="sr-only">{HELP}</p>
          )}
          <Button type="submit" variant="primary" size="lg" icon={MessageSquarePlus} loading={pending} disabled={disabled} className="ml-auto max-sm:w-full">
            Demander à Leon
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

export function DiscussionList() {
  const [params] = useSearchParams();
  const { key } = useLocation();
  const all = useDiscussions();
  const noModel = params.get('sansmodele') === '1';
  const items = params.get('vide') === '1' ? [] : all;
  const err = params.get('erreur');
  return (
    <div className="max-w-[880px]">
      <PageHeader
        title="Discussions"
        subtitle="Posez une question : Leon cherche, lit et répond en citant ses sources, ou dit qu’il ne sait pas."
        meta={<span className="inline-flex items-center gap-1.5"><Lock aria-hidden="true" />Vos discussions ne sont visibles que de vous.</span>}
      />
      <div className="grid gap-5">
        {noModel && <Notice tone="warning" live="status">{NO_MODEL}</Notice>}
        <NewDiscussion disabled={noModel} focusKey={params.get('nouvelle') === '1' ? key : null} demoError={err === 'longue' || err === 'creation' ? err : null} />
      </div>

      <Section id="vos-discussions" title="Vos discussions" className="mt-12">
        {items.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Aucune discussion pour l’instant."
            description={<>Posez une question ci-dessus, ou continuez une recherche en discussion depuis la page <Link to="/" className="font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline">Recherche</Link>.</>}
          />
        ) : (
          <GlassCard className="p-1.5">
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
              {items.map((d) => (
                <li key={d.id} className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line">
                  <Link
                    to={`/discussions/${d.id}`}
                    onPointerMove={trackSpot}
                    className="spot-host group flex min-h-[58px] items-center gap-3.5 rounded-field px-3 py-2.5 transition-colors duration-200 hover:bg-hover sm:gap-4"
                  >
                    <span className="spot" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                      <span className="min-w-0 truncate text-body font-medium text-fg sm:flex-1">{d.title}</span>
                      <time dateTime={d.updatedAt.toISOString()} className="shrink-0 text-meta tabular-nums text-muted">{formatRelative(d.updatedAt)}</time>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-fg" strokeWidth={1.7} />
                  </Link>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </Section>
    </div>
  );
}
