'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState, useTransition } from 'react';
import {
  buildFicheAction,
  correctFicheLineAction,
  retireFicheLineAction,
} from '@/app/(app)/settings/actions';
import type { SourceKind } from '@/capture/turn';
import {
  AlertDialog,
  Button,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Notice,
  Section,
  Select,
  Textarea,
  Thing,
  ToolLogo,
  toast,
} from '@/components/verre';
import {
  busyDays,
  busyHours,
  delayOf,
  FICHE_MAX,
  formatHour,
  joinList,
  type Ligne,
  languageShares,
  linesOf,
  percent,
  weekdayName,
} from '@/lib/fiche-view';
import { SOURCE_KIND_LABELS } from '@/lib/labels';
import { formatDate, formatNumber } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { FicheLine } from '@/server/portrait/fiche';
import type { FicheEtat, FicheScreen, FicheSource } from '@/server/portrait/screen';

// L'onglet « Ma fiche » des réglages : ce que Leon a compris de la façon de travailler de la personne (portrait/), en
// mots, ligne par ligne. Chaque ligne dit d'où elle vient et se retire ; se corrigent seulement son rôle, ses tâches,
// sa signature et le registre d'un interlocuteur, le reste est une mesure. Les gestes sont ceux des leçons de l'onglet
// Mémoire (memoire.tsx), sans la connexion récente : la fiche n'est lue que par elle.

type Result = { ok: true } | { error: string };
type ErrorKey = 'errorNotFound' | 'errorInvalid' | 'errorFailed';

export const errorOf = (code: string): ErrorKey =>
  code === 'introuvable' ? 'errorNotFound' : code === 'invalide' ? 'errorInvalid' : 'errorFailed';

// Un appel qui échoue (réseau) est une erreur comme une autre.
const attempt = async (call: () => Promise<Result>): Promise<Result> => {
  try {
    return await call();
  } catch {
    return { error: 'echec' };
  }
};

// Ce que la personne corrige, par genre : les champs de correctFields (portrait/fiche.ts). Un genre absent est une
// mesure.
const UNKNOWN = 'inconnu';
const FIELDS = {
  role: [{ name: 'texte', label: 'fieldRole', max: FICHE_MAX.role, required: true }],
  signature: [{ name: 'texte', label: 'fieldSignature', max: FICHE_MAX.signature, required: true }],
  tache: [
    { name: 'titre', label: 'fieldTitle', max: FICHE_MAX.titre, required: true },
    { name: 'detail', label: 'fieldDetail', max: FICHE_MAX.detail, required: false },
  ],
  interlocuteur: [{ name: 'registre', label: 'fieldRegister', max: 0, required: false }],
} as const;
type Editable = keyof typeof FIELDS;
const fieldsOf = (line: FicheLine) => (line.genre in FIELDS ? FIELDS[line.genre as Editable] : []);

// D'où vient la ligne : calculée sur N mails, écrite par Leon, ou corrigée par elle (avec la date).
function Provenance({ line }: { line: FicheLine }) {
  const t = useTranslations('fiche');
  const locale = useLocale();
  if (line.provenance === 'calcul') return t('fromMails', { count: line.mails ?? 0 });
  if (line.provenance !== 'personne') return t('fromLeon');
  return (
    line.corrigeeLe && (
      <time dateTime={line.corrigeeLe.toISOString()}>
        {t('fromYou', { date: formatDate(line.corrigeeLe, locale) })}
      </time>
    )
  );
}

// Une ligne de la fiche : ses mots, d'où elle vient, « Corriger » si elle se corrige, « Retirer » toujours.
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
    setDraft(Object.fromEntries(fields.map(({ name }) => [name, String(valeur[name] ?? UNKNOWN)])));
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
      const champs = Object.fromEntries(
        Object.entries(draft).map(([name, value]) => [
          name,
          name === 'registre' && value === UNKNOWN ? null : value,
        ]),
      );
      const result = await attempt(() => correctFicheLineAction({ id: line.id, champs }));
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
                max > 0 && (
                  <span className="text-muted tabular-nums">
                    {(draft[name] ?? '').length} / {max}
                  </span>
                )
              }
            >
              {name === 'registre' ? (
                <Select
                  className="w-full"
                  value={draft[name]}
                  onValueChange={(value) => setDraft({ ...draft, [name]: value })}
                  options={[
                    { value: 'tutoiement', label: t('registerTu') },
                    { value: 'vouvoiement', label: t('registerVous') },
                    { value: UNKNOWN, label: t('registerUnknown') },
                  ]}
                />
              ) : name === 'titre' ? (
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

// Une partie de la fiche : son titre, et ses lignes sur une feuille. Sans ligne, elle ne se montre pas.
function Part({ title, children }: { title: string; children: ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <Section title={title} className="mt-0">
      <GlassCard className="p-1.5">
        <ul aria-label={title} className="divide-y divide-line">
          {children}
        </ul>
      </GlassCard>
    </Section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-label text-muted">{children}</span>
);

// Les sources où on la voit faire une tâche, celles qu'elle voit encore : leur compte, et leur liste à ouvrir. Chacune
// mène à son outil, comme l'activité d'une personne dans l'écran Équipe.
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
        {sources.map((source) => {
          const props = {
            picture: <ToolLogo kind={source.kind} size={28} />,
            name: source.title?.trim() || t('untitled'),
            caption: SOURCE_KIND_LABELS[source.kind as SourceKind] ?? source.kind,
            className: 'w-full',
          };
          return (
            <li key={source.id}>
              {source.url ? (
                <Thing {...props} href={source.url} target="_blank" rel="noopener noreferrer" />
              ) : (
                <Thing {...props} chevron={false} disabled />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SIDES = ['tous', 'interne', 'externe'] as const;
const SIDE_LABELS = { tous: 'sideAll', interne: 'sideInternal', externe: 'sideExternal' } as const;
const LANGUAGES = {
  fr: 'langFr',
  en: 'langEn',
  autre: 'langOther',
  inconnue: 'langUnknown',
} as const;
const DELAYS = { minutes: 'delayMinutes', hours: 'delayHours', days: 'delayDays' } as const;

// Sa façon d'écrire à un type de destinataire : formules d'appel, formules de politesse, registre, longueur.
function StyleRows({
  lines,
  side,
  onGone,
}: {
  lines: FicheLine[];
  side: string;
  onGone: () => void;
}): ReactNode[] {
  const t = useTranslations('fiche');
  const of = <G extends 'appels' | 'politesses' | 'registre' | 'mots'>(genre: G) =>
    linesOf(lines, genre).filter((line) => line.cle === side);
  const formulas = (line: Ligne<'appels' | 'politesses'>) =>
    line.valeur.formules.map(({ formule, mails }) => t('formula', { formule, count: mails }));
  return [
    ...of('appels').map((line) => (
      <Row key={line.id} line={line} onGone={onGone}>
        <p>{nb(t('greetings', { list: formulas(line).join(', ') }))}</p>
      </Row>
    )),
    ...of('politesses').map((line) => (
      <Row key={line.id} line={line} onGone={onGone}>
        <p>{nb(t('closings', { list: formulas(line).join(', ') }))}</p>
      </Row>
    )),
    ...of('registre').map((line) => (
      <Row key={line.id} line={line} onGone={onGone}>
        <p>
          {nb(
            t('register', {
              tu: percent(line.valeur.tutoiement),
              vous: percent(line.valeur.vouvoiement),
            }),
          )}
        </p>
      </Row>
    )),
    ...of('mots').map((line) => (
      <Row key={line.id} line={line} onGone={onGone}>
        <p>{nb(t('length', { count: Math.round(line.valeur.mediane) }))}</p>
      </Row>
    )),
  ];
}

// Où en est la construction : ce qu'il faut pour commencer, le bouton, ou « en cours ». La page relit l'état à chaque
// chargement (la file le dit) ; une fois le rôle ou les tâches écrits, plus rien ici.
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
  return etat === 'a-construire' ? (
    <EmptyState title={t('noFiche')} description={t('buildHint')} action={button('build')} />
  ) : (
    <Notice live="status" action={button('complete')} className="max-w-2xl">
      {nb(t('completeHint'))}
    </Notice>
  );
}

/** L'onglet « Ma fiche » : `data` est null quand la page n'a pas pu lire (une erreur, pas une fiche vide). */
export function FicheSection({ data }: { data: FicheScreen | null }) {
  const t = useTranslations('fiche');
  const locale = useLocale();
  const top = useRef<HTMLDivElement>(null);
  if (!data) {
    return (
      <Notice tone="error" live="alert">
        {nb(t('loadFailed'))}
      </Notice>
    );
  }
  const { lines } = data;
  // La ligne retirée emporte le bouton qui avait le focus : il passe au haut de la fiche.
  const onGone = () => requestAnimationFrame(() => top.current?.focus({ preventScroll: true }));

  const delay = (minutes: number) => {
    const { unit, n } = delayOf(minutes);
    return t(DELAYS[unit], { count: n });
  };
  const sides = SIDES.filter((side) =>
    lines.some(
      (line) =>
        line.cle === side && ['appels', 'politesses', 'registre', 'mots'].includes(line.genre),
    ),
  );
  const contacts = linesOf(lines, 'interlocuteur').sort(
    (x, y) =>
      y.valeur.a + y.valeur.copie - (x.valeur.a + x.valeur.copie) || x.cle.localeCompare(y.cle),
  );
  const tasks = linesOf(lines, 'tache').sort((x, y) => Number(x.cle) - Number(y.cle));

  return (
    <div ref={top} tabIndex={-1} className="grid gap-12 outline-none">
      <Section title={t('title')} description={t('description')} className="mt-0">
        <Build etat={data.etat} />
      </Section>

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

      <Part title={t('contactsTitle')}>
        {contacts.map((line) => (
          <Row key={line.id} line={line} onGone={onGone}>
            <p className="font-medium">{line.cle}</p>
            <p>
              <Muted>
                {[
                  t('mailCount', { count: line.valeur.a + line.valeur.copie }),
                  line.valeur.type && t(line.valeur.type === 'interne' ? 'internal' : 'external'),
                  line.valeur.registre && t(line.valeur.registre),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Muted>
            </p>
          </Row>
        ))}
      </Part>

      {sides.length > 0 && (
        <Section title={t('styleTitle')} className="mt-0">
          <div className="grid gap-5">
            {sides.map((side) => (
              <div key={side}>
                {/* par type de destinataire seulement quand il y en a plusieurs */}
                {sides.length > 1 && (
                  <h3 className="mb-2 text-ui font-semibold text-fg">{t(SIDE_LABELS[side])}</h3>
                )}
                <GlassCard className="p-1.5">
                  <ul
                    aria-label={sides.length > 1 ? t(SIDE_LABELS[side]) : t('styleTitle')}
                    className="divide-y divide-line"
                  >
                    <StyleRows lines={lines} side={side} onGone={onGone} />
                  </ul>
                </GlassCard>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Part title={t('rhythmTitle')}>
        {[
          ...linesOf(lines, 'rythme').map((line) => (
            <Row key={line.id} line={line} onGone={onGone}>
              <p>{nb(t('perWeek', { rate: formatNumber(line.valeur.mailsParSemaine, locale) }))}</p>
            </Row>
          )),
          ...linesOf(lines, 'horaires').map((line) => {
            const ranges = busyHours(line.valeur.heures).map(([from, to]) =>
              t('hourRange', { from: formatHour(from, locale), to: formatHour(to, locale) }),
            );
            const days = busyDays(line.valeur.jours).map((day) => weekdayName(day, locale));
            return (
              <Row key={line.id} line={line} onGone={onGone}>
                {ranges.length > 0 && <p>{nb(t('hours', { ranges: joinList(ranges, locale) }))}</p>}
                {days.length > 0 && <p>{nb(t('days', { days: joinList(days, locale) }))}</p>}
              </Row>
            );
          }),
          ...linesOf(lines, 'delai-reponse').map((line) => (
            <Row key={line.id} line={line} onGone={onGone}>
              {line.valeur.tous.medianeMinutes !== null && (
                <p>{nb(t('replyDelay', { delay: delay(line.valeur.tous.medianeMinutes) }))}</p>
              )}
              {(['interne', 'externe'] as const).map((side) => {
                const minutes = line.valeur[side].medianeMinutes;
                return (
                  minutes !== null && (
                    <p key={side}>
                      <Muted>
                        {nb(t('sideDelay', { side: t(SIDE_LABELS[side]), delay: delay(minutes) }))}
                      </Muted>
                    </p>
                  )
                );
              })}
            </Row>
          )),
          ...linesOf(lines, 'langues').map((line) => (
            <Row key={line.id} line={line} onGone={onGone}>
              <p>
                {nb(
                  t('languages', {
                    list: languageShares(line.valeur)
                      .map(({ langue, part }) =>
                        t('language', { langue: t(LANGUAGES[langue]), part }),
                      )
                      .join(', '),
                  }),
                )}
              </p>
            </Row>
          )),
        ]}
      </Part>

      <Part title={t('signatureTitle')}>
        {linesOf(lines, 'signature').map((line) => (
          <Row key={line.id} line={line} onGone={onGone}>
            <p className="whitespace-pre-wrap">{line.valeur.texte}</p>
          </Row>
        ))}
      </Part>
    </div>
  );
}
