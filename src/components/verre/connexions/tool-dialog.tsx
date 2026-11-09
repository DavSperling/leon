'use client';

import {
  ArrowUpRight,
  ChevronDown,
  FlaskConical,
  LogIn,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, type RefObject, useEffect, useRef, useState, useTransition } from 'react';
import {
  connectAction,
  deleteConnectionAction,
  replaceKeyAction,
  setPausedAction,
  shareConnectionAction,
  syncNowAction,
} from '@/app/(app)/connexions/actions';
import {
  AlertDialog,
  Beam,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  Textarea,
  toast,
  useThinking,
} from '@/components/verre';
import {
  type ActionResult,
  ADMIN_CONSENT_MESSAGE,
  ADMIN_CONSENT_MESSAGE_EN,
  canReconnect,
  canSyncNow,
  DEFAULT_SINCE,
  inputTypeFor,
  type OAuthReturnPath,
  oauthStartPath,
  otherOwnersNote,
  panelMode,
  resultMessage,
  SINCE_VALUES,
  type SinceDays,
} from '@/lib/connection-form';
import { cn, duration, ease, isInstant, nb, unfilter } from '@/lib/verre';
import type { CatalogField, CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { type GroupOption, ShareSelect, usePartageLabel } from '../documents/partage';
import { secretText } from './model';
import { ConnStatus, StatusText } from './parts';

// Fenêtre d'un outil : ses connexions, leurs boutons, puis de quoi en brancher une. Pause et suppression : créateur ou
// administrateur (`canManage`) ; clé et reconnexion : créateur seul (`isCreator`) ; « Synchroniser maintenant » : tous.

const LINK =
  'inline-flex items-center gap-0.5 rounded-sm font-medium text-accent underline-offset-4 decoration-accent-line hover:underline';
/** Premier arrêt d'un formulaire d'ajout : « Se connecter avec … » s'il existe, sinon le premier champ de la clé. */
const firstStop = (root: HTMLElement | null | undefined) =>
  root?.querySelector<HTMLElement>('[data-autofocus]') ??
  root?.querySelector<HTMLElement>(
    'form input:not([type=hidden]), form textarea, form button[type=submit]',
  );
const enterUp = {
  initial: { opacity: 0, y: 8, filter: 'blur(6px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: duration.enter + 0.1, ease: ease.out },
    transitionEnd: unfilter,
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.exit } },
};
const sinceOf = (value: FormDataEntryValue | null): SinceDays =>
  SINCE_VALUES.find((candidate) => candidate === value) ?? DEFAULT_SINCE;

function PeriodField({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('connections');
  return (
    <Field label={t('periodLabel')} help={t('periodHelp')}>
      <Select
        name="since"
        options={SINCE_VALUES.map((value) => ({ value, label: t(`since.${value}`) }))}
        defaultValue={DEFAULT_SINCE}
        disabled={disabled}
      />
    </Field>
  );
}

// Un champ du formulaire d'un outil. Une clé n'est jamais préremplie ni réaffichée.
function FieldInput({ field, disabled }: { field: CatalogField; disabled?: boolean }) {
  const type = inputTypeFor(field);
  const common = { name: field.name, placeholder: field.placeholder, disabled };
  return (
    <Field label={field.label} help={field.help}>
      {type === 'textarea' ? (
        <Textarea {...common} rows={3} spellCheck={false} />
      ) : type === 'select' ? (
        <Select
          name={field.name}
          options={field.options ?? []}
          defaultValue={field.options?.[0]?.value}
          disabled={disabled}
        />
      ) : (
        <Input {...common} type={type} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      )}
    </Field>
  );
}

/** « Tester et brancher » / « Tester et remplacer » : rien n'est enregistré avant un test réussi ; la saisie s'efface après.
 *  `shared` : le formulaire OAuth au-dessus, qui porte déjà les champs communs (oauthPreFields) et la période.
 *  `onSuccess` rend le texte à afficher (« Connecté : … », remplacement) ou rien (ajout : la fenêtre montre la connexion). */
function KeyForm({
  entry,
  replaceId,
  shared,
  secondary,
  onSuccess,
}: {
  entry: CatalogItem;
  replaceId?: string;
  shared?: RefObject<HTMLFormElement | null>;
  secondary?: boolean;
  onSuccess?: () => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const fields = replaceId
    ? entry.fields.filter((x) => x.kind === 'secret')
    : entry.fields.filter((x) => !shared || !entry.oauthPreFields.includes(x.name));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { setThinking } = useThinking();
  useEffect(() => setThinking(pending), [pending, setThinking]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const common = shared?.current ? new FormData(shared.current) : null;
    const read = (name: string) => String(data.get(name) ?? common?.get(name) ?? '');
    // les champs se figent pendant le test : le focus passe au bouton (occupé mais focalisable) au lieu de tomber sur la page
    form.querySelector<HTMLButtonElement>('button[type=submit]')?.focus();
    setResult(null);
    startTransition(async () => {
      let outcome: ActionResult;
      try {
        outcome = replaceId
          ? await replaceKeyAction({
              id: replaceId,
              fields: Object.fromEntries(fields.map((x) => [x.name, read(x.name)])),
            })
          : await connectAction({
              provider: entry.id,
              fields: Object.fromEntries(entry.fields.map((x) => [x.name, read(x.name)])),
              since: sinceOf(common?.get('since') ?? data.get('since')),
            });
      } catch {
        outcome = { error: t('syncUnavailable') };
      }
      if ('error' in outcome) {
        setResult(outcome);
        // une erreur ramène au premier champ secret, à corriger
        const bad = fields.find((x) => x.kind === 'secret') ?? fields[0];
        requestAnimationFrame(() =>
          form.querySelector<HTMLElement>(`[name="${bad?.name}"]`)?.focus(),
        );
        return;
      }
      form.reset();
      if (onSuccess) onSuccess();
      else setResult(outcome);
    });
  };

  return (
    <Beam active={pending} className="rounded-box">
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-4 rounded-box border border-line bg-glass-3 p-4 shadow-hi"
      >
        {!replaceId && entry.keyHelp && (
          <p className="text-ui text-fg-2">
            {nb(entry.keyHelp)}{' '}
            <a href={entry.docsUrl} target="_blank" rel="noreferrer" className={LINK}>
              {t('whereKey')}
              <ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
              <span className="sr-only">{t('newTab')}</span>
            </a>
          </p>
        )}
        {fields.map((x) => (
          <FieldInput key={x.name} field={x} disabled={pending} />
        ))}
        {!replaceId && !shared && <PeriodField disabled={pending} />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="submit"
            variant={secondary ? 'secondary' : 'primary'}
            size="sm"
            loading={pending}
            className="scroll-mb-8"
          >
            {pending ? t('testPending') : replaceId ? t('testReplace') : t('testConnect')}
          </Button>
          <div aria-live="polite" className="min-w-0">
            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  key={resultMessage(result, locale)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <StatusText tone={'error' in result ? 'destructive' : 'success'}>
                    {resultMessage(result, locale)}
                  </StatusText>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </Beam>
  );
}

function AdminConsent({ url }: { url: string }) {
  const t = useTranslations('connections');
  return (
    <a href={url} target="_blank" rel="noreferrer" className={LINK}>
      {t('adminConsent')}
      <ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
      <span className="sr-only">{t('newTab')}</span>
    </a>
  );
}

// « Se connecter avec … » : une navigation vers l'éditeur (formulaire POST), pas une action serveur.
// Les champs non secrets et la période partent avec ; les jetons, eux, ne passent jamais ici.
function OAuthForm({
  entry,
  ref,
  returnTo,
}: {
  entry: CatalogItem;
  ref: RefObject<HTMLFormElement | null>;
  returnTo?: OAuthReturnPath;
}) {
  const t = useTranslations('connections');
  const en = useLocale() === 'en';
  // Le départ chez l'éditeur prend une seconde (Pipedream crée d'abord un lien) : le bouton le dit. Un retour arrière
  // peut rendre la page gardée en mémoire par le navigateur, bouton compris : `pageshow` le remet à zéro.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reset = () => setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <form
      ref={ref}
      method="post"
      action={oauthStartPath(entry.id)}
      onSubmit={() => setLeaving(true)}
      className="grid gap-4"
    >
      {returnTo && <input type="hidden" name="retour" value={returnTo} />}
      {entry.oauthHelp && <p className="text-ui text-fg-2">{nb(entry.oauthHelp)}</p>}
      {entry.fields
        .filter((x) => entry.oauthPreFields.includes(x.name))
        .map((x) => (
          <FieldInput key={x.name} field={x} />
        ))}
      <PeriodField />
      <div>
        <Button type="submit" variant="primary" icon={LogIn} loading={leaving} data-autofocus>
          {t('connectWith', { provider: entry.label })}
        </Button>
      </div>
      {entry.adminConsentUrl && (
        <p className="text-label text-fg-2">
          {nb(en ? ADMIN_CONSENT_MESSAGE_EN : ADMIN_CONSENT_MESSAGE)}{' '}
          <AdminConsent url={entry.adminConsentUrl} />
        </p>
      )}
    </form>
  );
}

/** Le bouton d'abord, la clé en secours (« ou coller une clé ») ; la clé seule quand l'appli n'est pas configurée. Aussi dans la file de l'onboarding. */
export function AddConnection({
  entry,
  onAdded,
  returnTo,
}: {
  entry: CatalogItem;
  onAdded: () => void;
  returnTo?: OAuthReturnPath;
}) {
  const t = useTranslations('connections');
  const mode = panelMode(entry);
  const keyBox = useRef<HTMLDivElement>(null);
  const oauthForm = useRef<HTMLFormElement>(null);
  // le volet s'ouvre : focus sur le secret, et « Tester et brancher » entre dans la partie visible de la fenêtre
  const onKeyOpen = (o: boolean) => {
    if (!o) return;
    requestAnimationFrame(() => {
      keyBox.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
      keyBox.current
        ?.querySelector('button[type=submit]')
        ?.scrollIntoView({ block: 'nearest', behavior: isInstant() ? 'auto' : 'smooth' });
    });
  };
  if (mode === 'none')
    return (
      <p className="text-ui text-fg-2">{nb(t('unconfiguredApp', { provider: entry.label }))}</p>
    );
  if (mode === 'key') return <KeyForm entry={entry} onSuccess={onAdded} />;
  return (
    <div className="grid gap-5">
      <OAuthForm entry={entry} ref={oauthForm} returnTo={returnTo} />
      {mode === 'oauth+key' && (
        <Collapsible onOpenChange={onKeyOpen} className="grid gap-3">
          <CollapsibleTrigger className={cn(LINK, 'group w-fit py-1 text-ui')}>
            {t('pasteKey')}
            <ChevronDown
              aria-hidden="true"
              strokeWidth={1.8}
              className="ml-0.5 size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent ref={keyBox}>
            {/* un seul bouton plein par vue : quand « Se connecter avec … » existe, le test de clé passe en secondaire */}
            <KeyForm entry={entry} shared={oauthForm} secondary onSuccess={onAdded} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Une action de gestion : un message de réussite ou d'échec, jamais d'exception à l'écran.
function useManage() {
  const t = useTranslations('connections');
  const [pending, startTransition] = useTransition();
  const run = (
    action: () => Promise<{ ok: boolean }>,
    done: string,
    failed: string,
    after?: () => void,
  ) =>
    startTransition(async () => {
      try {
        const { ok } = await action();
        if (ok) {
          toast.success(done);
          after?.();
        } else toast.error(failed);
      } catch {
        toast.error(t('syncUnavailable'));
      }
    });
  return { pending, run };
}

function ConnectionCard({
  c,
  entry,
  now,
  canConnect,
  onRemoved,
  returnTo,
  groups,
}: {
  c: ConnectionView;
  entry: CatalogItem;
  now: Date;
  canConnect: boolean;
  onRemoved: () => void;
  returnTo?: OAuthReturnPath;
  groups?: GroupOption[];
}) {
  const t = useTranslations('connections');
  const d = useTranslations('documents');
  const partageLabel = usePartageLabel(groups ?? []);
  // Sans choix enregistré, celui de l'outil : privé à qui branche (boîte mail, Drive, Slack), sinon toute l'équipe.
  const partage = c.partage ?? (entry.privateRaw ? 'moi' : 'equipe');
  const locale = useLocale();
  const [replacing, setReplacing] = useState(false);
  const { pending, run } = useManage();
  const paused = c.status === 'paused';
  const oauth = canReconnect(c);
  return (
    <motion.li
      layout="position"
      {...enterUp}
      data-conn={c.id}
      tabIndex={-1}
      className="grid gap-3 rounded-card border border-line bg-glass-2 p-4 shadow-hi"
    >
      <div className="grid gap-1">
        <p className="text-ui font-semibold break-words text-fg">{c.label}</p>
        <ConnStatus c={c} now={now} />
        <p className="font-mono text-meta tracking-normal text-muted">{secretText(c, locale)}</p>
      </div>
      {groups && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted">
          <span>{d('shareWith')}</span>
          {c.isCreator ? (
            <ShareSelect
              share={(next) => shareConnectionAction(c.id, next)}
              value={partage}
              groups={groups}
              label={d('shareLabel', { title: c.label })}
            />
          ) : (
            <span className="text-fg-2">
              {partage === 'moi' ? c.createdBy.name : partageLabel(partage)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          className="mr-1"
          disabled={pending || !canSyncNow(c)}
          onClick={() => run(() => syncNowAction(c.id), t('syncRequested'), t('syncFailed'))}
        >
          {t('syncNow')}
        </Button>
        {c.canManage && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => setPausedAction(c.id, !paused),
                  paused ? t('connectionResumed') : t('connectionPaused'),
                  t('connectionMissing'),
                )
              }
            >
              {paused ? t('resume') : t('pause')}
            </Button>
            {c.isCreator &&
              (oauth ? (
                // « Reconnecter » refait le déroulé chez l'éditeur et remplace les jetons de la même connexion
                <form method="post" action={oauthStartPath(c.provider)}>
                  <input type="hidden" name="reconnect" value={c.id} />
                  {returnTo && <input type="hidden" name="retour" value={returnTo} />}
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    disabled={!canConnect || !entry.oauthReady}
                  >
                    {t('reconnect')}
                  </Button>
                </form>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canConnect}
                  aria-expanded={replacing}
                  onClick={() => setReplacing((o) => !o)}
                >
                  {t('replaceKey')}
                </Button>
              ))}
            <AlertDialog
              trigger={
                <Button size="sm" variant="ghost" icon={Trash2} disabled={pending}>
                  {t('delete')}
                </Button>
              }
              title={t('deleteTitle', { name: c.label })}
              description={t('deleteConfirm', {
                provider: entry.label,
                credential: oauth ? t('tokens') : t('key'),
              })}
              confirmLabel={t('delete')}
              tone="destructive"
              onConfirm={() =>
                run(
                  () => deleteConnectionAction(c.id),
                  t('connectionDeleted'),
                  t('connectionMissing'),
                  onRemoved,
                )
              }
            />
          </>
        )}
      </div>
      {c.isCreator && oauth && canConnect && !entry.oauthReady && (
        <p className="text-label text-muted">{nb(t('appGone', { provider: entry.label }))}</p>
      )}
      {replacing && canConnect && c.isCreator && !oauth && (
        <KeyForm entry={entry} replaceId={c.id} />
      )}
    </motion.li>
  );
}

function Panel({
  entry,
  conns,
  viewerId,
  now,
  canConnect,
  focusDialog,
  returnTo,
  groups,
}: {
  entry: CatalogItem;
  conns: ConnectionView[];
  viewerId: string;
  now: Date;
  canConnect: boolean;
  focusDialog: () => void;
  returnTo?: OAuthReturnPath;
  groups?: GroupOption[];
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const [adding, setAdding] = useState(conns.length === 0);
  const addRef = useRef<HTMLDivElement>(null);
  const userAdd = useRef(false);
  const others = otherOwnersNote(conns, viewerId, locale);
  const showAdd = canConnect && (conns.length === 0 || adding);
  useEffect(() => {
    // « Brancher une autre connexion » disparaît au clic : le focus passe à l'action principale du formulaire
    if (adding && userAdd.current) firstStop(addRef.current)?.focus();
  }, [adding]);
  const onAdded = () => {
    setAdding(false);
    toast.success(t('connectedToast', { provider: entry.label }));
    focusDialog();
  };
  return (
    <>
      {/* l'avertissement de l'éditeur (Outlook, Attio…), seul en ton d'alerte */}
      {entry.warning && (
        <p className="flex gap-2 text-label text-fg-2">
          <TriangleAlert
            aria-hidden="true"
            strokeWidth={1.8}
            className="mt-[2px] size-3.5 shrink-0 text-warning"
          />
          {nb(entry.warning)}
        </p>
      )}
      {conns.length > 0 && (
        <ul className="grid gap-3">
          <AnimatePresence initial={false}>
            {conns.map((c) => (
              <ConnectionCard
                key={c.id}
                c={c}
                entry={entry}
                now={now}
                canConnect={canConnect}
                onRemoved={focusDialog}
                returnTo={returnTo}
                groups={groups}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {!canConnect && <p className="text-ui text-fg-2">{nb(t('connectorsUnavailable'))}</p>}
      {showAdd && (
        <motion.div
          ref={addRef}
          {...enterUp}
          className={cn('grid gap-4', conns.length > 0 && 'border-t border-line pt-5')}
        >
          {/* simple remarque au moment d'en ajouter une : qui l'a déjà branché se lit aussi sur chaque connexion */}
          {others && (
            <p className="text-label text-muted">{nb(`${others} ${t('duplicateWarning')}`)}</p>
          )}
          <AddConnection entry={entry} onAdded={onAdded} returnTo={returnTo} />
        </motion.div>
      )}
      {canConnect && conns.length > 0 && !adding && (
        <Button
          variant="ghost"
          size="sm"
          icon={Plus}
          className="w-fit"
          onClick={() => {
            userAdd.current = true;
            setAdding(true);
          }}
        >
          {t('another')}
        </Button>
      )}
      {/* une note discrète en pied de fenêtre plutôt qu'un badge sur chaque outil */}
      {!entry.triedForReal && (
        <p className="flex items-start gap-1.5 text-label text-muted">
          <FlaskConical
            aria-hidden="true"
            strokeWidth={1.7}
            className="mt-[2px] size-3.5 shrink-0"
          />
          {nb(t('notTested'))}
        </p>
      )}
    </>
  );
}

export function ToolDialog({
  entry,
  open,
  onOpenChange,
  onCloseAutoFocus,
  conns,
  viewerId,
  now,
  canConnect,
  session,
  returnTo,
  groups,
}: {
  entry: CatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (e: Event) => void;
  /** Les connexions de cet outil. */
  conns: ConnectionView[];
  viewerId: string;
  now: Date;
  canConnect: boolean;
  /** Change à chaque ouverture : l'état de la fenêtre repart de zéro. */
  session: number;
  /** La page où le retour de l'éditeur revient (le formulaire poste `retour`) ; absente : Connexions. */
  returnTo?: OAuthReturnPath;
  /** Les groupes de l'organisation : avec eux, chaque connexion dit qui voit ce qu'elle relève, et son créateur le change. */
  groups?: GroupOption[];
}) {
  const t = useTranslations('connections');
  const content = useRef<HTMLDivElement>(null);
  // après une suppression ou un ajout, le bouton qui avait le focus a disparu : on le rend à la fenêtre
  const focusDialog = () =>
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body) content.current?.focus();
    }, 220);
  if (!entry) return null;
  // à l'ouverture : sans connexion, sur l'action principale (firstStop) ; avec, sur la fenêtre elle-même
  // (Radix viserait « Synchroniser maintenant », qu'un Entrée distrait lancerait)
  const autoFocus = (e: Event) => {
    e.preventDefault();
    const el = content.current;
    ((conns.length === 0 ? firstStop(el) : null) ?? el)?.focus();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        size="lg"
        onOpenAutoFocus={autoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        title={entry.label}
        description={
          entry.privateRaw
            ? t('privateTool', { provider: entry.label })
            : t('sharedTool', { provider: entry.label })
        }
      >
        <Panel
          key={`${entry.id}-${session}`}
          entry={entry}
          conns={conns}
          viewerId={viewerId}
          now={now}
          canConnect={canConnect}
          focusDialog={focusDialog}
          returnTo={returnTo}
          groups={groups}
        />
      </DialogContent>
    </Dialog>
  );
}
