'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState, useTransition } from 'react';
import {
  answerAgentAction,
  buildFicheAction,
  correctFicheLineAction,
  discardBrouillonAction,
  retireFicheLineAction,
} from '@/app/(app)/settings/actions';
import {
  AlertDialog,
  Button,
  CopyButton,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Notice,
  Pill,
  Section,
  Textarea,
  toast,
} from '@/components/verre';
import { FICHE_MAX, linesOf } from '@/lib/fiche-view';
import { formatDate } from '@/lib/verre';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { FicheLine } from '@/server/portrait/fiche';
import type { Proposal } from '@/server/portrait/propositions';
import type { FicheBrouillon, FicheEtat, FicheScreen, FicheSource } from '@/server/portrait/screen';
import { SourceThing } from './source-thing';

// L'onglet « Ma fiche » des réglages : ce que Leon a compris du travail de la personne (portrait/), en mots : son rôle
// et les tâches qu'elle refait. Chaque ligne dit d'où elle vient, se corrige et se retire. Les mesures calculées sur
// ses mails (interlocuteurs, façon d'écrire, rythme, signature) restent enregistrées, sans s'afficher. Les gestes sont
// ceux des leçons de l'onglet Mémoire (memoire.tsx), sans la connexion récente : la fiche n'est lue que par elle.
// Sous ses tâches, les agents de départ que Leon lui propose : un oui ou un non par agent, rien d'autre. En tête, quand
// il y en a, les brouillons de réponse que l'agent « Brouillons de réponse » lui a préparés : à copier ou à écarter.

type Result = { ok: true } | { error: string };
type ErrorKey = 'errorNotFound' | 'errorInvalid' | 'errorFailed';

export const errorOf = (code: string): ErrorKey =>
  code === 'introuvable' ? 'errorNotFound' : code === 'invalide' ? 'errorInvalid' : 'errorFailed';

// Un appel qui échoue (réseau) est une erreur comme une autre.
const attempt = async <T extends Result>(
  call: () => Promise<T>,
): Promise<T | { error: 'echec' }> => {
  try {
    return await call();
  } catch {
    return { error: 'echec' };
  }
};

// Ce que la personne corrige, par genre : les champs de correctFields (portrait/fiche.ts).
const FIELDS = {
  role: [{ name: 'texte', label: 'fieldRole', max: FICHE_MAX.role, required: true }],
  tache: [
    { name: 'titre', label: 'fieldTitle', max: FICHE_MAX.titre, required: true },
    { name: 'detail', label: 'fieldDetail', max: FICHE_MAX.detail, required: false },
  ],
} as const;
type Editable = keyof typeof FIELDS;
const fieldsOf = (line: FicheLine) => (line.genre in FIELDS ? FIELDS[line.genre as Editable] : []);

// D'où vient la ligne : écrite par Leon, ou corrigée par elle (avec la date).
function Provenance({ line }: { line: FicheLine }) {
  const t = useTranslations('fiche');
  const locale = useLocale();
  if (line.provenance !== 'personne') return t('fromLeon');
  return (
    line.corrigeeLe && (
      <time dateTime={line.corrigeeLe.toISOString()}>
        {t('fromYou', { date: formatDate(line.corrigeeLe, locale) })}
      </time>
    )
  );
}

// Une ligne de la fiche : ses mots, d'où elle vient, « Corriger » et « Retirer ».
function Row({
  line,
  onGone,
  after,
  children,
}: {
  line: FicheLine;
  // La ligne retirée emporte le bouton qui avait le focus : à l'onglet de le reprendre.
  onGone: () => void;
  // Sous les boutons : les sources d'une tâche.
  after?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('fiche');
  const router = useRouter();
  const fields = fieldsOf(line);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const words = `ligne-${line.id}`;
  const editButton = `corriger-${line.id}`;

  const startEditing = () => {
    const valeur = line.valeur as Record<string, unknown>;
    setDraft(Object.fromEntries(fields.map(({ name }) => [name, String(valeur[name] ?? '')])));
  };
  // Ce que la ligne fait d'une réponse des actions : une erreur se dit sur place. Une ligne qui n'existe plus (retirée
  // ailleurs) disparaît quand la page relit la fiche : c'est la pastille qui le dit.
  const settle = (result: Result): boolean => {
    const failed = 'ok' in result ? null : errorOf(result.error);
    setError(failed === 'errorNotFound' ? null : failed);
    if (failed === 'errorNotFound') {
      toast.error(t(failed));
      router.refresh();
    }
    return failed === null;
  };
  const stopEditing = () => {
    setDraft(null);
    requestAnimationFrame(() =>
      document.getElementById(editButton)?.focus({ preventScroll: true }),
    );
  };
  const save = () =>
    startSaving(async () => {
      if (!draft) return;
      const result = await attempt(() => correctFicheLineAction({ id: line.id, champs: draft }));
      if (settle(result)) {
        toast.success(t('saved'));
        stopEditing();
      }
    });
  const remove = () =>
    startRemoving(async () => {
      const result = await attempt(() => retireFicheLineAction(line.id));
      if (settle(result)) {
        toast.success(t('removed'));
        onGone();
      }
    });

  return (
    <li className="px-3 py-3.5">
      {error && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(t(error))}
        </Notice>
      )}
      {draft ? (
        <form action={save} className="grid max-w-xl gap-3">
          {fields.map(({ name, label, max }) => (
            <Field
              key={name}
              label={t(label)}
              aside={
                <span className="text-muted tabular-nums">
                  {(draft[name] ?? '').length} / {max}
                </span>
              }
            >
              {name === 'titre' ? (
                <Input
                  value={draft[name] ?? ''}
                  onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                  maxLength={max}
                />
              ) : (
                <Textarea
                  value={draft[name] ?? ''}
                  onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                  maxLength={max}
                  rows={3}
                  autoGrow
                />
              )}
            </Field>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={saving}
              disabled={fields.some(
                ({ name, required }) => required && (draft[name] ?? '').trim() === '',
              )}
            >
              {t('save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={stopEditing}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div id={words} className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg">
            {children}
          </div>
          <p className="mt-1 text-label text-muted">
            <Provenance line={line} />
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fields.length > 0 && (
              <Button
                id={editButton}
                aria-describedby={words}
                size="sm"
                variant="quiet"
                onClick={startEditing}
              >
                {t('edit')}
              </Button>
            )}
            <AlertDialog
              trigger={
                <Button size="sm" variant="quiet" loading={removing} aria-describedby={words}>
                  {t('remove')}
                </Button>
              }
              title={t('removeTitle')}
              description={t('removeDescription')}
              confirmLabel={t('remove')}
              cancelLabel={t('cancel')}
              onConfirm={remove}
            />
          </div>
        </>
      )}
      {after}
    </li>
  );
}

// Une partie de la fiche : son titre, une phrase sous lui si elle en a une, et ses lignes sur une feuille. Sans ligne,
// elle ne se montre pas.
function Part({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode[];
}) {
  if (children.length === 0) return null;
  return (
    <Section title={title} description={description} className="mt-0">
      <GlassCard className="p-1.5">
        <ul aria-label={title} className="divide-y divide-line">
          {children}
        </ul>
      </GlassCard>
    </Section>
  );
}

// Les sources où on la voit faire une tâche, celles qu'elle voit encore : leur compte, et leur liste à ouvrir.
function Sources({ id, sources }: { id: string; sources: Array<FicheSource & { id: string }> }) {
  const t = useTranslations('fiche');
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  const panel = `sources-${id}`;
  const label = t('seenIn', { count: sources.length });
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        aria-controls={panel}
        aria-describedby={`ligne-${id}`}
        onClick={() => setOpen(!open)}
      >
        {label}
      </Button>
      <ul id={panel} hidden={!open} aria-label={label} className="mt-2 grid gap-2">
        {sources.map((source) => (
          <li key={source.id}>
            <SourceThing source={source} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Un brouillon de réponse prêt : le correspondant, la date du mail reçu, le fil lié à son outil, le texte du brouillon
// tel quel, « Copier » et « Écarter ». Rien ne part d'ici, et rien ne s'y modifie : elle colle le texte dans sa réponse,
// ou le retrouve dans ses brouillons Gmail quand il y est déposé. « Écarter » le retire aussi de Gmail.
function Brouillon({ draft, onGone }: { draft: FicheBrouillon; onGone: () => void }) {
  const t = useTranslations('fiche');
  const locale = useLocale();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [discarding, startDiscarding] = useTransition();
  const words = `brouillon-${draft.id}`;
  const discard = () =>
    startDiscarding(async () => {
      const result = await attempt(() => discardBrouillonAction(draft.id));
      // Un brouillon déjà écarté ailleurs disparaît quand la page relit la fiche.
      const gone = 'error' in result && result.error === 'introuvable';
      setFailed('error' in result && !gone);
      if ('ok' in result) {
        // Écarté dans Leon, mais resté dans sa boîte : elle doit le savoir, il peut encore en partir.
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        else toast.success(t('discarded'));
        onGone();
      }
      if (gone) {
        toast.error(t('draftGone'));
        router.refresh();
      }
    });
  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(t('errorFailed'))}
        </Notice>
      )}
      <div id={words} className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg">
        <p className="font-medium">{draft.from}</p>
        <p className="text-label text-muted">
          <time dateTime={draft.receivedAt.toISOString()}>
            {t('draftReceived', { date: formatDate(draft.receivedAt, locale) })}
          </time>
        </p>
        {draft.depose && <p className="text-label text-muted">{t('draftDeposited')}</p>}
      </div>
      <div className="mt-2">
        <SourceThing source={draft.source} />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-body [overflow-wrap:anywhere] text-fg">
        {draft.texte}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton value={draft.texte} variant="quiet" aria-describedby={words} />
        <Button
          size="sm"
          variant="quiet"
          loading={discarding}
          aria-describedby={words}
          onClick={discard}
        >
          {t('discard')}
        </Button>
      </div>
    </li>
  );
}

// Un agent de départ proposé : son nom, sa phrase, s'il est en service, « Oui » et « Non ». Le bouton enfoncé est la
// réponse que Leon garde (aucun tant qu'elle n'a pas répondu) ; l'autre la change. Ni raison ni mesure : l'écran ne
// reçoit que l'agent, son état et sa réponse.
function Agent({ agent, oui, enService }: Proposal) {
  const t = useTranslations('fiche');
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [answering, startAnswering] = useTransition();
  const words = `agent-${agent}`;
  const answer = (value: boolean) =>
    startAnswering(async () => {
      const result = await attempt(() => answerAgentAction({ agent, oui: value }));
      // Un agent qui ne lui est plus proposé (un outil débranché depuis) disparaît quand la page relit la fiche.
      const gone = 'error' in result && result.error === 'introuvable';
      setFailed('error' in result && !gone);
      if ('ok' in result) toast.success(t('agentSaved'));
      if (gone) {
        toast.error(t('agentGone'));
        router.refresh();
      }
    });
  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(t('errorFailed'))}
        </Notice>
      )}
      <div id={words} className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg">
        <p className="font-medium">{t(`agents.${agent}.name`)}</p>
        <p className="text-fg-2">{nb(t(`agents.${agent}.text`))}</p>
        <p className="text-label text-muted">{t(enService ? 'agentRunning' : 'agentNotYet')}</p>
      </div>
      <div
        aria-busy={answering}
        className={cn('mt-2 flex flex-wrap gap-2 transition-opacity', answering && 'opacity-60')}
      >
        {[true, false].map((value) => (
          // Un état, pas une action : contour et coche, comme les familles suivies de l'écran Équipe.
          <Pill
            key={String(value)}
            aria-pressed={oui === value}
            aria-describedby={words}
            icon={oui === value ? Check : undefined}
            className="aria-pressed:border-fg aria-pressed:bg-sheet aria-pressed:text-fg aria-pressed:[&_svg]:text-fg"
            onClick={() => !answering && oui !== value && answer(value)}
          >
            {t(value ? 'agentYes' : 'agentNo')}
          </Pill>
        ))}
      </div>
    </li>
  );
}

// Où en est la construction : ce qu'il faut pour commencer, le bouton (avec ce qu'une construction finie n'a pas
// trouvé), ou « en cours ». La page relit l'état à chaque chargement (la file le dit) ; une fois le rôle ou les tâches
// écrits, plus rien ici.
function Build({ etat }: { etat: FicheEtat }) {
  const t = useTranslations('fiche');
  const router = useRouter();
  const [requesting, startRequesting] = useTransition();
  if (etat === 'faite') return null;
  if (etat === 'en-cours')
    return (
      <Notice
        live="status"
        action={{ label: t('refresh'), onClick: () => router.refresh() }}
        className="max-w-2xl"
      >
        {nb(t('building'))}
      </Notice>
    );
  if (etat === 'sans-boite')
    return (
      <EmptyState
        title={t('noFiche')}
        description={t('noMailbox')}
        action={
          <Button asChild size="sm">
            <Link href="/connections">{t('openConnections')}</Link>
          </Button>
        }
      />
    );
  const request = () =>
    startRequesting(async () => {
      const result = await attempt(async () =>
        (await buildFicheAction()).ok ? { ok: true } : { error: 'echec' },
      );
      if ('ok' in result) return;
      toast.error(t('buildFailed'));
      router.refresh();
    });
  const button = (label: 'build' | 'complete') => (
    <Button variant="primary" loading={requesting} onClick={request}>
      {t(label)}
    </Button>
  );
  return etat === 'a-completer' ? (
    <Notice live="status" action={button('complete')} className="max-w-2xl">
      {nb(t('completeHint'))}
    </Notice>
  ) : (
    <EmptyState
      title={t('noFiche')}
      description={t(etat === 'sans-mail' ? 'noMail' : 'buildHint')}
      action={button('build')}
    />
  );
}

/** L'onglet « Ma fiche » : `data` est null quand la page n'a pas pu lire (une erreur, pas une fiche vide). */
export function FicheSection({ data }: { data: FicheScreen | null }) {
  const t = useTranslations('fiche');
  const top = useRef<HTMLDivElement>(null);
  if (!data) {
    return (
      <Notice tone="error" live="alert">
        {nb(t('loadFailed'))}
      </Notice>
    );
  }
  const { lines } = data;
  // La ligne retirée, ou le brouillon écarté, emporte le bouton qui avait le focus : il passe au haut de la fiche.
  const onGone = () => requestAnimationFrame(() => top.current?.focus({ preventScroll: true }));
  const tasks = linesOf(lines, 'tache').sort((x, y) => Number(x.cle) - Number(y.cle));

  return (
    <div ref={top} tabIndex={-1} className="grid gap-12 outline-none">
      <Section title={t('title')} description={t('description')} className="mt-0">
        <Build etat={data.etat} />
      </Section>

      <Part title={t('draftsTitle')} description={t('draftsHint')}>
        {data.brouillons.map((draft) => (
          <Brouillon key={draft.id} draft={draft} onGone={onGone} />
        ))}
      </Part>

      <Part title={t('roleTitle')}>
        {linesOf(lines, 'role').map((line) => (
          <Row key={line.id} line={line} onGone={onGone}>
            <p className="whitespace-pre-wrap">{line.valeur.texte}</p>
          </Row>
        ))}
      </Part>

      <Part title={t('tasksTitle')}>
        {tasks.map((line) => (
          <Row
            key={line.id}
            line={line}
            onGone={onGone}
            after={
              <Sources
                id={line.id}
                sources={line.valeur.sources.flatMap((id) => {
                  const source = data.sources[id];
                  return source ? [{ id, ...source }] : [];
                })}
              />
            }
          >
            <p className="font-medium">{line.valeur.titre}</p>
            {line.valeur.detail && <p className="text-fg-2">{line.valeur.detail}</p>}
          </Row>
        ))}
      </Part>

      <Part title={t('agentsTitle')} description={t('agentsHint')}>
        {data.agents.map((one) => (
          <Agent key={one.agent} {...one} />
        ))}
      </Part>
    </div>
  );
}
