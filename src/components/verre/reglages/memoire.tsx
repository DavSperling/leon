'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import {
  correctLessonAction,
  readMemoryVersionAction,
  restoreMemoryVersionAction,
  retireLessonAction,
  setNotesOpenAction,
  writeLessonAction,
} from '@/app/(app)/reglages/actions';
import { repoOf } from '@/capture/turn';
import {
  AlertDialog,
  Badge,
  Button,
  EmptyState,
  Field,
  GlassCard,
  Notice,
  Section,
  Select,
  Switch,
  Textarea,
  toast,
} from '@/components/verre';
import { formatDate, formatDateTime } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type {
  MemoryLesson,
  MemoryNote,
  MemoryTarget,
  MemoryThread,
  MemoryVersion,
} from '@/server/memory/memory-section';

// La section Mémoire des réglages (T55, T57 ; D33, D37, D38) : les leçons de l'auteur, ses fils et les notes de ses agents,
// avec leurs versions lisibles.
// Écrire, corriger et remettre exigent une connexion de moins d'une heure : `recent` vient de la page, et une action
// qui rend « reconnexion » (l'heure a passé page ouverte) fait de même. Retirer reste possible.

// Le choix « tous mes dépôts » du menu : aucune clé de projet n'est une étoile.
export const ALL_REPOS = '*';
export const projectOf = (choice: string): string | null => (choice === ALL_REPOS ? null : choice);
const repoLabel = (project: string) => repoOf(project) ?? project;

type Result = { ok: true } | { error: string };
type ErrorKey = 'errorModified' | 'errorNotFound' | 'errorInvalid' | 'errorFailed';
export type Outcome =
  | { kind: 'ok' }
  | { kind: 'reconnect' }
  | { kind: 'error'; message: ErrorKey; reload: boolean };

// Ce que la section fait d'une réponse des actions : « reconnexion » demande la connexion, « modifiée entre-temps » et
// « introuvable » sont une erreur claire et rechargent la liste, tout autre code est une erreur sans recopie.
export function outcomeOf(result: Result): Outcome {
  if ('ok' in result) return { kind: 'ok' };
  switch (result.error) {
    case 'reconnexion':
      return { kind: 'reconnect' };
    case 'modifiee':
      return { kind: 'error', message: 'errorModified', reload: true };
    case 'introuvable':
      return { kind: 'error', message: 'errorNotFound', reload: true };
    case 'invalide':
      return { kind: 'error', message: 'errorInvalid', reload: false };
    default:
      return { kind: 'error', message: 'errorFailed', reload: false };
  }
}

// Un appel qui échoue (réseau) est une erreur comme une autre.
const attempt = async (call: () => Promise<Result>): Promise<Result> => {
  try {
    return await call();
  } catch {
    return { error: 'echec' };
  }
};

type Control = { stale: boolean; settle: (result: Result) => boolean; error: ErrorKey | null };

// Chaque partie a sa propre erreur, affichée à sa tête ; la reconnexion, elle, vaut pour toute la section.
function useControl(stale: boolean, expire: () => void): Control {
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const settle = (result: Result) => {
    const outcome = outcomeOf(result);
    setError(outcome.kind === 'error' ? outcome.message : null);
    if (outcome.kind === 'reconnect') expire();
    if (outcome.kind === 'error' && outcome.reload) router.refresh();
    return outcome.kind === 'ok';
  };
  return { stale, settle, error };
}

const WHO = {
  serveur: 'whoServer',
  modele: 'whoModel',
  agent: 'whoAgent',
  humain: 'whoHuman',
} as const;
const MOTIF = {
  rangement: 'motifTidy',
  note: 'motifNote',
  correction: 'motifEdit',
  acceptation: 'motifAccepted',
  restauration: 'motifRestored',
} as const;

function ErrorNotice({ error, max }: { error: ErrorKey | null; max: number }) {
  const t = useTranslations('memory');
  if (!error) return null;
  return (
    <Notice tone="error" live="alert" className="mb-4">
      {nb(t(error, { max }))}
    </Notice>
  );
}

// `putBackOnly` : les parties des fils et des notes, où le seul geste coupé est « Remettre ».
function Reconnect({ putBackOnly = false }: { putBackOnly?: boolean }) {
  const t = useTranslations('memory');
  return (
    <Notice
      tone="warning"
      live="status"
      action={
        <Button asChild size="sm" variant="secondary">
          <a href="/connexion?retour=memoire">{t('reconnectLink')}</a>
        </Button>
      }
    >
      {nb(t(putBackOnly ? 'reconnectThreads' : 'reconnect'))}
    </Notice>
  );
}

// Une version plus ancienne que la dernière est à remettre : sans elle, la reconnexion n'a rien à débloquer.
const hasOlderVersion = (items: { n: number; versions: MemoryVersion[] }[]) =>
  items.some((item) => item.versions.some((version) => version.n !== item.n));

// Une version de l'historique : son numéro, sa date, qui l'a écrite et pourquoi ; son texte à ouvrir si elle est
// lisible ; « Remettre cette version » pour l'auteur, sauf pour la dernière.
function VersionRow({
  cible,
  id,
  version,
  latest,
  ctl,
}: {
  cible: MemoryTarget['cible'];
  id: string;
  version: MemoryVersion;
  latest: number;
  ctl: Control;
}) {
  const t = useTranslations('memory');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [reading, startReading] = useTransition();
  const [restoring, startRestoring] = useTransition();
  const panel = `version-${id}-${version.n}`;

  const toggle = () => {
    if (open || text !== null || gone) return setOpen(!open);
    setOpen(true);
    startReading(async () => {
      try {
        const result = await readMemoryVersionAction({ cible, id, n: version.n });
        if ('ok' in result) setText(result.version.texte);
        else setGone(true);
      } catch {
        setGone(true);
      }
    });
  };
  const restore = () =>
    startRestoring(async () => {
      const result = await attempt(() =>
        restoreMemoryVersionAction({ cible, id, n: version.n, depuis: latest }),
      );
      if (ctl.settle(result)) toast.success(t('restored'));
    });

  return (
    <li className="grid gap-2 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 text-label text-muted">
          <span className="font-semibold text-fg-2">{t('version', { n: version.n })}</span>
          {version.n === latest && <> ({t('latest')})</>} ·{' '}
          <time dateTime={version.creeLe.toISOString()}>
            {formatDateTime(version.creeLe, locale)}
          </time>{' '}
          · {t(WHO[version.ecritPar])} · {t(MOTIF[version.motif])}
        </p>
        <Button
          size="sm"
          variant="quiet"
          aria-expanded={open}
          aria-controls={panel}
          loading={reading}
          onClick={toggle}
        >
          {open ? t('hideText') : t('showText')}
        </Button>
        {!ctl.stale && version.n !== latest && (
          <Button size="sm" variant="secondary" loading={restoring} onClick={restore}>
            {t('putBack')}
          </Button>
        )}
      </div>
      <div id={panel} hidden={!open}>
        {gone ? (
          <p className="text-label text-muted">{t('versionGone')}</p>
        ) : (
          text !== null && (
            <pre className="whitespace-pre-wrap rounded-field border border-line bg-glass-3 p-3 font-sans text-label leading-[1.6] [overflow-wrap:anywhere] text-fg">
              {text}
            </pre>
          )
        )}
      </div>
    </li>
  );
}

// L'historique d'une leçon ou d'un fil, de la plus récente à la plus ancienne, sous un bouton qui l'ouvre.
function History({
  cible,
  id,
  versions,
  latest,
  ctl,
  describedBy,
}: {
  cible: MemoryTarget['cible'];
  id: string;
  versions: MemoryVersion[];
  latest: number;
  ctl: Control;
  // L'élément qui nomme la leçon ou le fil : « Historique » se lit avec lui, pas seul, dans une liste.
  describedBy: string;
}) {
  const t = useTranslations('memory');
  const [open, setOpen] = useState(false);
  const panel = `histoire-${id}`;
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        aria-controls={panel}
        aria-describedby={describedBy}
        onClick={() => setOpen(!open)}
      >
        {t('history')}
      </Button>
      <div id={panel} hidden={!open}>
        {versions.length === 0 ? (
          <p className="py-2 text-label text-muted">{t('noVersions')}</p>
        ) : (
          <ul aria-label={t('history')} className="divide-y divide-line">
            {[...versions].reverse().map((version) => (
              <VersionRow
                key={version.n}
                cible={cible}
                id={id}
                version={version}
                latest={latest}
                ctl={ctl}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const Count = ({ value, max }: { value: string; max: number }) => (
  <span className="text-muted tabular-nums">
    {value.length} / {max}
  </span>
);

function LessonRow({
  lesson,
  ctl,
  max,
  onGone,
}: {
  lesson: MemoryLesson;
  ctl: Control;
  max: number;
  onGone: () => void;
}) {
  const t = useTranslations('memory');
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.texte);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const editButton = `corriger-${lesson.id}`;

  const stopEditing = () => {
    setEditing(false);
    requestAnimationFrame(() =>
      document.getElementById(editButton)?.focus({ preventScroll: true }),
    );
  };
  const save = () =>
    startSaving(async () => {
      const result = await attempt(() =>
        correctLessonAction({ id: lesson.id, texte: text, depuis: lesson.n }),
      );
      if (ctl.settle(result)) {
        toast.success(t('saved'));
        stopEditing();
      }
    });
  const remove = () =>
    startRemoving(async () => {
      const result = await attempt(() => retireLessonAction(lesson.id));
      if (ctl.settle(result)) {
        toast.success(t('removed'));
        onGone();
      }
    });

  return (
    <li className="px-3 py-3.5">
      {editing && !ctl.stale ? (
        <form action={save} className="grid gap-3">
          <Field label={t('lessonText')} aside={<Count value={text} max={max} />}>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={max}
              rows={3}
              autoGrow
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={saving}
              disabled={text.trim() === ''}
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
          <p
            id={`texte-${lesson.id}`}
            className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-fg"
          >
            {lesson.texte}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-1.5 text-label text-muted">
            <span>{lesson.projet ? repoLabel(lesson.projet) : t('allRepos')}</span>
            <span aria-hidden="true">·</span>
            <span>
              <time dateTime={lesson.accepteeLe.toISOString()}>
                {t('acceptedOn', { date: formatDate(lesson.accepteeLe, locale) })}
              </time>
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!ctl.stale && (
              <Button
                id={editButton}
                aria-describedby={`texte-${lesson.id}`}
                size="sm"
                variant="quiet"
                onClick={() => {
                  setText(lesson.texte);
                  setEditing(true);
                }}
              >
                {t('edit')}
              </Button>
            )}
            <AlertDialog
              trigger={
                <Button
                  size="sm"
                  variant="quiet"
                  loading={removing}
                  aria-describedby={`texte-${lesson.id}`}
                >
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
      <History
        cible="lecon"
        id={lesson.id}
        versions={lesson.versions}
        latest={lesson.n}
        ctl={ctl}
        describedBy={`texte-${lesson.id}`}
      />
    </li>
  );
}

function LessonsSection({
  lessons,
  repos,
  max,
  ctl,
}: {
  lessons: MemoryLesson[];
  repos: string[];
  max: number;
  ctl: Control;
}) {
  const t = useTranslations('memory');
  const [text, setText] = useState('');
  const [choice, setChoice] = useState(ALL_REPOS);
  const [adding, startAdding] = useTransition();
  const field = useRef<HTMLDivElement>(null);

  const add = () =>
    startAdding(async () => {
      const result = await attempt(() =>
        writeLessonAction({ texte: text, projet: projectOf(choice) }),
      );
      if (ctl.settle(result)) {
        toast.success(t('added'));
        setText('');
      }
    });
  // la ligne retirée emporte le bouton qui avait le focus : il passe au champ d'écriture, s'il y en a un
  const focusField = () =>
    requestAnimationFrame(() =>
      field.current?.querySelector('textarea')?.focus({ preventScroll: true }),
    );

  return (
    <Section title={t('lessonsTitle')} description={t('lessonsDescription')} className="mt-0">
      <ErrorNotice error={ctl.error} max={max} />
      {ctl.stale ? (
        <Reconnect />
      ) : (
        <form action={add} className="mb-6 grid max-w-xl gap-4">
          <div ref={field}>
            <Field label={t('newLesson')} aside={<Count value={text} max={max} />}>
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={max}
                rows={3}
                autoGrow
                placeholder={t('lessonPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('repository')}>
            <Select
              className="w-full"
              value={choice}
              onValueChange={setChoice}
              options={[
                { value: ALL_REPOS, label: t('allRepos') },
                ...repos.map((repo) => ({ value: repo, label: repoLabel(repo) })),
              ]}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={adding}
            disabled={text.trim() === ''}
            className="w-fit"
          >
            {t('addLesson')}
          </Button>
        </form>
      )}
      {lessons.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('lessonsTitle')} className="divide-y divide-line">
            {lessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} ctl={ctl} max={max} onGone={focusField} />
            ))}
          </ul>
        </GlassCard>
      ) : (
        <EmptyState
          title={t('noLessons')}
          description={ctl.stale ? undefined : t('noLessonsHint')}
          className="py-8"
        />
      )}
    </Section>
  );
}

function ThreadsSection({
  threads,
  max,
  ctl,
}: {
  threads: MemoryThread[];
  max: number;
  ctl: Control;
}) {
  const t = useTranslations('memory');
  return (
    <Section title={t('threadsTitle')} description={t('threadsDescription')} className="mt-0">
      <ErrorNotice error={ctl.error} max={max} />
      {/* « Remettre » est le seul geste de cette partie : sans lui, rien à dire */}
      {ctl.stale && hasOlderVersion(threads) && (
        <div className="mb-4">
          <Reconnect putBackOnly />
        </div>
      )}
      {threads.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('threadsTitle')} className="divide-y divide-line">
            {threads.map((thread) => (
              <li key={thread.id} className="px-3 py-3.5">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span
                    id={`titre-${thread.id}`}
                    className="min-w-0 text-body font-medium [overflow-wrap:anywhere] text-fg"
                  >
                    {thread.titre}
                  </span>
                  {thread.absorbe && <Badge>{t('merged')}</Badge>}
                </p>
                {thread.projet && (
                  <p className="mt-0.5 text-label text-muted">{repoLabel(thread.projet)}</p>
                )}
                <History
                  cible="fil"
                  id={thread.id}
                  versions={thread.versions}
                  latest={thread.n}
                  ctl={ctl}
                  describedBy={`titre-${thread.id}`}
                />
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : (
        <EmptyState title={t('noThreads')} description={t('noThreadsHint')} className="py-8" />
      )}
    </Section>
  );
}

// Le réglage `noter` du compte (T65, C16), comme l'interrupteur des managers : il suit le clic tout de suite, et un refus
// le remet comme la page le relit. Ni texte poussé ni connexion récente (D37).
function NotesSwitch({ open }: { open: boolean }) {
  const t = useTranslations('memory');
  const [shown, setShown] = useOptimistic(open);
  const [, startTransition] = useTransition();
  const toggle = (next: boolean) =>
    startTransition(async () => {
      setShown(next);
      try {
        const { ok } = await setNotesOpenAction(next);
        if (!ok) toast.error(t('notesToggleFailed'));
      } catch {
        toast.error(t('notesToggleFailed'));
      }
    });
  return (
    <GlassCard className="mb-4 grid gap-2 p-4">
      <Switch
        label={t('notesToggle')}
        checked={shown}
        onCheckedChange={toggle}
        aria-describedby="notes-remember"
      />
      <p id="notes-remember" className="text-label text-muted">
        {nb(t('notesToggleHint'))}
      </p>
    </GlassCard>
  );
}

// Les notes de l'agent (D38) : le texte se lit dans l'historique, la liste n'en montre que le début. Aucune écriture
// depuis le site, hors « Remettre cette version ».
function NotesSection({
  notes,
  open,
  max,
  ctl,
}: {
  notes: MemoryNote[];
  open: boolean;
  max: number;
  ctl: Control;
}) {
  const t = useTranslations('memory');
  const locale = useLocale();
  return (
    <Section title={t('notesTitle')} description={t('notesDescription')} className="mt-0">
      <NotesSwitch open={open} />
      <ErrorNotice error={ctl.error} max={max} />
      {ctl.stale && hasOlderVersion(notes) && (
        <div className="mb-4">
          <Reconnect putBackOnly />
        </div>
      )}
      {notes.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('notesTitle')} className="divide-y divide-line">
            {notes.map((note) => (
              <li key={note.id} className="px-3 py-3.5">
                <p
                  id={`note-${note.id}`}
                  className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap text-fg"
                >
                  {note.titre}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-1.5 text-label text-muted">
                  {note.outil && (
                    <>
                      <span>{note.outil}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {note.projet && (
                    <>
                      <span>{repoLabel(note.projet)}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>
                    <time dateTime={note.creeLe.toISOString()}>
                      {t('writtenOn', { date: formatDate(note.creeLe, locale) })}
                    </time>
                  </span>
                </p>
                <History
                  cible="note"
                  id={note.id}
                  versions={note.versions}
                  latest={note.n}
                  ctl={ctl}
                  describedBy={`note-${note.id}`}
                />
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : (
        <EmptyState title={t('noNotes')} description={t('noNotesHint')} className="py-8" />
      )}
    </Section>
  );
}

export type MemoryData = {
  threads: MemoryThread[];
  lessons: MemoryLesson[];
  notes: MemoryNote[];
  repos: string[];
  notesOpen: boolean; // le réglage `noter` du compte est nul : `remember` écrit (T65)
};

/** L'onglet Mémoire : `data` est null quand la page n'a pas pu lire (une erreur, pas une liste vide). */
export function MemorySection({
  recent,
  max,
  data,
}: {
  recent: boolean;
  max: number;
  data: MemoryData | null;
}) {
  const t = useTranslations('memory');
  const [expired, setExpired] = useState(false);
  const stale = !recent || expired;
  const lessons = useControl(stale, () => setExpired(true));
  const threads = useControl(stale, () => setExpired(true));
  const notes = useControl(stale, () => setExpired(true));
  if (!data) {
    return (
      <Notice tone="error" live="alert">
        {nb(t('loadFailed'))}
      </Notice>
    );
  }
  return (
    <div className="grid gap-12">
      <LessonsSection lessons={data.lessons} repos={data.repos} max={max} ctl={lessons} />
      <ThreadsSection threads={data.threads} max={max} ctl={threads} />
      <NotesSection notes={data.notes} open={data.notesOpen} max={max} ctl={notes} />
    </div>
  );
}
