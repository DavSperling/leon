'use client';

import {
  ArrowUpRight,
  ChevronRight,
  KeyRound,
  ListChecks,
  Pause,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  connectAction,
  deleteConnectionAction,
  replaceKeyAction,
  setPausedAction,
  shareConnectionAction,
  syncNowAction,
} from '@/app/(app)/connexions/actions';
import {
  Badge,
  Button,
  DoneMark,
  Fact,
  Facts,
  Field,
  Input,
  Notice,
  PanelClose,
  PanelDone,
  PanelNote,
  Select,
  SidePanel,
  StatusRow,
  Textarea,
  ToolLogo,
  toast,
} from '@/components/verre';
import {
  type ActionResult,
  ADMIN_CONSENT_MESSAGE,
  ADMIN_CONSENT_MESSAGE_EN,
  canReconnect,
  canSyncNow,
  DEFAULT_SINCE,
  inputTypeFor,
  type OAuthNotice,
  type OAuthReturnPath,
  oauthStartPath,
  otherOwnersNote,
  panelMode,
  SINCE_VALUES,
  type SinceDays,
} from '@/lib/connection-form';
import { cn, formatDate, formatNumber, formatSince, nb } from '@/lib/verre';
import type { CatalogField, CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { type GroupOption, usePartageLabel, usePartageOptions } from '../documents/partage';
import { blockHeading, credentialText, scopeOf, toolState, troubleOf } from './model';
import { stateDetail } from './parts';

/*
 * Le panneau d'un outil (la feuille de côté du kit) : brancher (bouton chez l'éditeur, ou clé), gérer chacune de ses
 * connexions (état, synchroniser, qui voit, pause, clé, reconnexion, suppression), réparer celle de la personne qui
 * est en panne, et dire « branché » sur place. Pause et suppression : créateur ou administrateur (`canManage`) ; clé et
 * reconnexion : créateur seul (`isCreator`) ; « Synchroniser maintenant » : tous. Les actions sont celles du serveur.
 */

const LINK =
  'inline-flex items-center gap-0.5 font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg';
const SMALL = 'text-label leading-[1.5] text-muted';
const DONE_MS = 2400;

const sinceOf = (value: FormDataEntryValue | null): SinceDays =>
  SINCE_VALUES.find((candidate) => candidate === value) ?? DEFAULT_SINCE;

function External({ href, children }: { href: string; children: ReactNode }) {
  const t = useTranslations('connections');
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK}>
      {children}
      <ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
      <span className="sr-only">{t('newTab')}</span>
    </a>
  );
}

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
function FieldInput({
  field,
  disabled,
  first,
}: {
  field: CatalogField;
  disabled?: boolean;
  /** Le champ que le panneau vise à l'ouverture (une clé à ressaisir). */
  first?: boolean;
}) {
  const type = inputTypeFor(field);
  const common = {
    name: field.name,
    placeholder: field.placeholder,
    disabled,
    'data-autofocus': first ? '' : undefined,
  };
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

function Refusal({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-label font-medium text-destructive">
      {typeof children === 'string' ? nb(children) : children}
    </p>
  );
}

type KeyState = {
  pending: boolean;
  error: string | null;
  submit: (e: FormEvent<HTMLFormElement>) => void;
};

/** « Tester et brancher » / « Tester et remplacer » : rien n'est enregistré avant un test réussi ; la saisie s'efface après.
 *  `shared` : le formulaire OAuth voisin, qui porte déjà les champs communs (oauthPreFields) et la période. */
function useKeySubmit({
  entry,
  replaceId,
  shared,
  onSuccess,
  onPending,
}: {
  entry: CatalogItem;
  replaceId?: string;
  shared?: RefObject<HTMLFormElement | null>;
  onSuccess: (account: string) => void;
  /** Le test de la clé part ou finit : le panneau se verrouille pendant ce temps. */
  onPending?: (pending: boolean) => void;
}): KeyState {
  const t = useTranslations('connections');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const common = shared?.current ? new FormData(shared.current) : null;
    const read = (name: string) => String(data.get(name) ?? common?.get(name) ?? '');
    const fields = keyFields(entry, replaceId, Boolean(shared));
    setError(null);
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
        setError(outcome.error);
        // une erreur ramène au premier champ secret, à corriger (une fois l'envoi fini : avant, le champ est grisé)
        const bad = fields.find((x) => x.kind === 'secret') ?? fields[0];
        refocus.current = form.querySelector<HTMLElement>(`[name="${bad?.name}"]`);
        return;
      }
      form.reset();
      onSuccess(outcome.account);
    });
  };
  const refocus = useRef<HTMLElement | null>(null);
  // le retour à « fini » passe aussi par le démontage (un changement de vue pendant le test ne laisse pas le verrou)
  useEffect(() => {
    if (!pending) return;
    onPending?.(true);
    return () => onPending?.(false);
  }, [pending, onPending]);
  useEffect(() => {
    if (pending || !refocus.current) return;
    refocus.current.focus();
    refocus.current = null;
  }, [pending]);
  return { pending, error, submit };
}

const keyFields = (entry: CatalogItem, replaceId?: string, shared?: boolean) =>
  replaceId
    ? entry.fields.filter((x) => x.kind === 'secret')
    : entry.fields.filter((x) => !shared || !entry.oauthPreFields.includes(x.name));

/** Les champs d'une clé, l'aide « où la trouver », la période pour un ajout ; le bouton vient de l'appelant (dans le
 *  formulaire, ou au pied du panneau avec `form={id}`). */
function KeyFields({
  entry,
  id,
  replaceId,
  shared,
  state,
  autofocus,
  children,
}: {
  entry: CatalogItem;
  id?: string;
  replaceId?: string;
  shared?: boolean;
  state: KeyState;
  autofocus?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('connections');
  return (
    <form id={id} onSubmit={state.submit} noValidate className="grid gap-3.5">
      {keyFields(entry, replaceId, shared).map((x, i) => (
        <FieldInput key={x.name} field={x} disabled={state.pending} first={autofocus && i === 0} />
      ))}
      {!replaceId && !shared && <PeriodField disabled={state.pending} />}
      {entry.keyHelp && (
        <PanelNote>
          {nb(entry.keyHelp)} <External href={entry.docsUrl}>{t('whereKey')}</External>
        </PanelNote>
      )}
      {state.error && <Refusal>{state.error}</Refusal>}
      {children}
    </form>
  );
}

// « Se connecter avec … » : une navigation vers l'éditeur (formulaire POST), pas une action serveur.
// Les champs non secrets et la période partent avec ; les jetons, eux, ne passent jamais ici.
function OAuthFields({
  entry,
  id,
  ref,
  returnTo,
  onLeave,
  children,
}: {
  entry: CatalogItem;
  id?: string;
  ref: RefObject<HTMLFormElement | null>;
  returnTo?: OAuthReturnPath;
  onLeave: () => void;
  children?: ReactNode;
}) {
  return (
    <form
      id={id}
      ref={ref}
      method="post"
      action={oauthStartPath(entry.id)}
      onSubmit={onLeave}
      className="grid gap-3.5"
    >
      {returnTo && <input type="hidden" name="retour" value={returnTo} />}
      {entry.fields
        .filter((x) => entry.oauthPreFields.includes(x.name))
        .map((x) => (
          <FieldInput key={x.name} field={x} />
        ))}
      <PeriodField />
      {entry.oauthHelp && <PanelNote>{nb(entry.oauthHelp)}</PanelNote>}
      {children}
    </form>
  );
}

/** Le départ chez l'éditeur prend une seconde (Pipedream crée d'abord un lien) : le bouton le dit. Un retour arrière
 *  peut rendre la page gardée en mémoire par le navigateur, bouton compris : `pageshow` le remet à zéro. */
function useLeaving() {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reset = () => setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return [leaving, () => setLeaving(true)] as const;
}

function AdminConsentLine({ url }: { url: string }) {
  const t = useTranslations('connections');
  const en = useLocale() === 'en';
  return (
    <p className={SMALL}>
      {nb(en ? ADMIN_CONSENT_MESSAGE_EN : ADMIN_CONSENT_MESSAGE)}{' '}
      <External href={url}>{t('adminConsent')}</External>
    </p>
  );
}

/** « ou coller une clé » : le volet de la clé, sous le bouton de l'éditeur. */
function PasteKey({
  entry,
  shared,
  onAdded,
  onPending,
}: {
  entry: CatalogItem;
  shared: RefObject<HTMLFormElement | null>;
  onAdded: (account: string) => void;
  onPending?: (pending: boolean) => void;
}) {
  const t = useTranslations('connections');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const state = useKeySubmit({ entry, shared, onSuccess: onAdded, onPending });
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, [open]);
  return (
    <div className="grid gap-3.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(LINK, 'w-fit text-ui')}
      >
        {t('pasteKey')}
      </button>
      {open && (
        <div ref={box} className="rounded-card border border-line p-4">
          {/* un seul bouton d'encre par vue : celui de l'éditeur ; le test de la clé est en contour */}
          <KeyFields entry={entry} shared state={state}>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              loading={state.pending}
              loadingLabel={t('testPending')}
            >
              {t('testConnect')}
            </Button>
          </KeyFields>
        </div>
      )}
    </div>
  );
}

/** Le bouton d'abord, la clé en secours (« ou coller une clé ») ; la clé seule quand l'appli n'est pas configurée.
 *  Les boutons sont dans le formulaire : la file de l'onboarding s'en sert hors du panneau. */
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
  const oauthForm = useRef<HTMLFormElement>(null);
  const [leaving, leave] = useLeaving();
  const keyState = useKeySubmit({ entry, onSuccess: onAdded });
  if (mode === 'none')
    return <p className={SMALL}>{nb(t('unconfiguredApp', { provider: entry.label }))}</p>;
  if (mode === 'key')
    return (
      <KeyFields entry={entry} state={keyState}>
        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          loading={keyState.pending}
          loadingLabel={t('testPending')}
        >
          {t('testConnect')}
        </Button>
      </KeyFields>
    );
  return (
    <div className="grid gap-5">
      <OAuthFields entry={entry} ref={oauthForm} returnTo={returnTo} onLeave={leave}>
        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          loading={leaving}
          loadingLabel={t('opening', { provider: entry.label })}
          data-autofocus
        >
          {t('connectWith', { provider: entry.label })}
        </Button>
      </OAuthFields>
      {mode === 'oauth+key' && <PasteKey entry={entry} shared={oauthForm} onAdded={onAdded} />}
      {entry.adminConsentUrl && <AdminConsentLine url={entry.adminConsentUrl} />}
    </div>
  );
}

/** Qui voit ce qu'une connexion relève, dit en mots : « Équipe », « Vous seul », « Seulement Ana », un groupe. */
function useScopeWord(groups: GroupOption[]) {
  const t = useTranslations('connections');
  const label = usePartageLabel(groups);
  return (c: Pick<ConnectionView, 'isCreator' | 'createdBy'>, scope: string) =>
    scope === 'equipe'
      ? t('team')
      : scope === 'moi'
        ? c.isCreator
          ? t('onlyYou')
          : t('onlyName', { name: c.createdBy.name })
        : label(scope);
}

/** Le créateur change qui voit ce que sa connexion relève : enregistré tout de suite, « Enregistré » dit sur place. */
function ShareField({
  c,
  value,
  groups,
}: {
  c: ConnectionView;
  value: string;
  groups: GroupOption[];
}) {
  const t = useTranslations('connections');
  const d = useTranslations('documents');
  const options = usePartageOptions(groups);
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<'saved' | 'failed' | null>(null);
  useEffect(() => {
    if (said !== 'saved') return;
    const id = setTimeout(() => setSaid(null), DONE_MS);
    return () => clearTimeout(id);
  }, [said]);
  const change = (partage: string) =>
    startTransition(async () => {
      try {
        const { ok } = await shareConnectionAction(c.id, partage);
        setSaid(ok ? 'saved' : 'failed');
      } catch {
        setSaid('failed');
      }
    });
  return (
    <div className="grid gap-1.5">
      <Select
        aria-label={d('shareLabel', { title: c.label })}
        value={options.some((o) => o.value === value) ? value : undefined}
        placeholder={d('shareGroup')}
        onValueChange={change}
        disabled={pending}
        options={options}
        className="h-9"
      />
      <span aria-live="polite" className="text-label">
        {said === 'saved' && <DoneMark>{t('saved')}</DoneMark>}
      </span>
      {said === 'failed' && <Refusal>{d('shareFailed')}</Refusal>}
    </div>
  );
}

/** L'état d'une connexion : la pastille, et l'action de la ligne (synchroniser, reprendre). */
function StateRow({ c, now, focusMe }: { c: ConnectionView; now: Date; focusMe?: boolean }) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const trouble = troubleOf(c);
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<'synced' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(null), DONE_MS);
    return () => clearTimeout(id);
  }, [said]);
  const run = (action: () => Promise<{ ok: boolean }>, failed: string, done?: 'synced') =>
    startTransition(async () => {
      setError(null);
      try {
        const { ok } = await action();
        if (!ok) setError(failed);
        else if (done) setSaid(done);
      } catch {
        setError(t('syncUnavailable'));
      }
    });
  const badge =
    trouble === 'stopped' ? (
      <Badge tone="destructive">{t('statusStopped')}</Badge>
    ) : trouble ? (
      <Badge tone="destructive">{t(trouble)}</Badge>
    ) : c.status === 'paused' ? (
      <Badge>{t('statusPaused')}</Badge>
    ) : c.lastSyncAt ? (
      <Badge tone="success">
        {t('syncedAgo', { time: formatSince(c.lastSyncAt, now, locale) })}
      </Badge>
    ) : (
      <Badge tone="warning">{t('firstSync')}</Badge>
    );
  const action =
    c.status === 'paused' ? (
      c.canManage && (
        <Button
          size="xs"
          loading={pending}
          onClick={() => run(() => setPausedAction(c.id, false), t('connectionMissing'))}
        >
          {t('resume')}
        </Button>
      )
    ) : said ? (
      <span role="status" className="px-1 text-label">
        <DoneMark>{t('syncRequestedShort')}</DoneMark>
      </span>
    ) : (
      canSyncNow(c) &&
      trouble !== 'disconnected' && (
        <Button
          size="xs"
          loading={pending}
          loadingLabel={t('requesting')}
          onClick={() => run(() => syncNowAction(c.id), t('syncFailed'), 'synced')}
        >
          {t('syncNow')}
        </Button>
      )
    );
  // la raison, écrite par Leon (« Intercom rejected the key ») ou « Ana n'est plus membre »
  const reason = trouble
    ? trouble === 'stopped'
      ? stateDetail(c, now, locale)
      : c.lastError
    : null;
  return (
    <>
      <StatusRow
        tabIndex={focusMe ? -1 : undefined}
        data-autofocus={focusMe ? '' : undefined}
        className="outline-none"
      >
        {badge}
        {action}
      </StatusRow>
      {reason && <p className="mt-3 text-ui leading-[1.5] text-fg">{nb(reason)}</p>}
      {error && (
        <div className="mt-2">
          <Refusal>{error}</Refusal>
        </div>
      )}
    </>
  );
}

/** Une connexion dans le panneau : son état, ce qu'elle est, et ce qu'on peut y faire. `repair` : la connexion en panne
 *  de la personne, que le bouton d'encre du pied reconnecte (sa clé se saisit ici). */
function ConnectionBlock({
  c,
  entry,
  now,
  groups,
  canConnect,
  repair,
  repairKey,
  heading,
  returnTo,
  mayChooseRepos,
  onAskDelete,
  onPending,
  focusMe,
}: {
  focusMe?: boolean;
  c: ConnectionView;
  entry: CatalogItem;
  now: Date;
  groups?: GroupOption[];
  canConnect: boolean;
  repair: boolean;
  repairKey: KeyState;
  /** Plusieurs comptes : le titre du bloc (blockHeading). */
  heading?: string;
  returnTo?: OAuthReturnPath;
  mayChooseRepos?: boolean;
  onAskDelete: () => void;
  onPending: (pending: boolean) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const scopeWord = useScopeWord(groups ?? []);
  const github = c.provider === 'github';
  const scope = scopeOf(c, entry.privateRaw);
  const oauth = canReconnect(c);
  const trouble = troubleOf(c);
  const [replacing, setReplacing] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [pausing, startPause] = useTransition();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const replaceState = useKeySubmit({
    entry,
    replaceId: c.id,
    onSuccess: () => {
      setReplacing(false);
      setReplaced(true);
    },
    onPending,
  });
  useEffect(() => {
    if (!replaced) return;
    const id = setTimeout(() => setReplaced(false), DONE_MS);
    return () => clearTimeout(id);
  }, [replaced]);
  const mayKey = c.isCreator && canConnect && !c.creatorLeft;
  const pause = () =>
    startPause(async () => {
      setPauseError(null);
      try {
        const { ok } = await setPausedAction(c.id, true);
        if (!ok) setPauseError(t('connectionMissing'));
      } catch {
        setPauseError(t('syncUnavailable'));
      }
    });
  const links = [
    c.canManage && c.status !== 'paused' && (
      <Button
        key="pause"
        variant="quiet"
        icon={Pause}
        className="cx-act"
        loading={pausing}
        onClick={pause}
      >
        {t('pause')}
      </Button>
    ),
    mayKey &&
      !repair &&
      (oauth ? (
        entry.oauthReady && (
          // « Reconnecter » refait le déroulé chez l'éditeur et remplace les jetons de la même connexion
          <form key="reconnect" method="post" action={oauthStartPath(c.provider)}>
            <input type="hidden" name="reconnect" value={c.id} />
            {returnTo && <input type="hidden" name="retour" value={returnTo} />}
            <Button type="submit" variant="quiet" icon={RotateCw} className="cx-act">
              {t('reconnect')}
            </Button>
          </form>
        )
      ) : (
        <Button
          key="key"
          variant="quiet"
          icon={KeyRound}
          className="cx-act"
          aria-expanded={replacing}
          onClick={() => setReplacing((o) => !o)}
        >
          {t('replaceKey')}
        </Button>
      )),
    github && mayChooseRepos && (
      <Link key="repos" href="/reglages#equipe" className="cx-act">
        <ListChecks aria-hidden="true" strokeWidth={1.8} />
        {t('chooseRepos')}
        <ChevronRight aria-hidden="true" strokeWidth={1.6} className="cx-act__go" />
      </Link>
    ),
    heading && c.canManage && (
      <Button key="delete" variant="quiet" icon={Trash2} className="cx-act" onClick={onAskDelete}>
        {t('deleteConnection')}
      </Button>
    ),
  ].filter(Boolean);
  return (
    <div className="grid">
      {/* plusieurs comptes portent souvent le même nom : chaque bloc dit d'abord qui l'a branché */}
      {heading && (
        <h3 className="mb-3 text-lead font-semibold [overflow-wrap:anywhere]">{nb(heading)}</h3>
      )}
      <StateRow c={c} now={now} focusMe={focusMe} />
      {trouble && trouble !== 'stopped' && !c.isCreator && (
        <p className={cn(SMALL, 'mt-2')}>{nb(t('onlyCreator', { name: c.createdBy.name }))}</p>
      )}
      <Facts className="mt-1">
        <Fact label={t('account')}>{nb(c.label)}</Fact>
        <Fact label={t('visibleTo')}>
          {c.isCreator && !github && groups ? (
            <ShareField c={c} value={scope} groups={groups} />
          ) : (
            scopeWord(c, scope)
          )}
          {github && <small>{t('githubScope')}</small>}
        </Fact>
        <Fact label={t('itemsSaved')}>
          {c.itemsSynced ? formatNumber(c.itemsSynced, locale) : t('noneYet')}
        </Fact>
        <Fact label={t('connectedBy')}>
          {nb(c.createdBy.name)}
          <small>
            {formatDate(c.createdAt, locale)} · {credentialText(c, locale)}
          </small>
        </Fact>
      </Facts>
      {repair &&
        (oauth ? (
          !entry.oauthReady && <PanelNote>{nb(t('appGone', { provider: entry.label }))}</PanelNote>
        ) : (
          <div className="mt-1 border-t border-line pt-4">
            <KeyFields entry={entry} id="repair-key" replaceId={c.id} state={repairKey} autofocus />
          </div>
        ))}
      {repair && oauth && entry.oauthReady && (
        // vide : le bouton « Reconnecter » du pied le soumet (form="reconnect")
        <form id="reconnect" method="post" action={oauthStartPath(c.provider)} hidden>
          <input type="hidden" name="reconnect" value={c.id} />
          {returnTo && <input type="hidden" name="retour" value={returnTo} />}
        </form>
      )}
      {links.length > 0 && <div className="cx-acts">{links}</div>}
      {pauseError && (
        <div className="mt-2">
          <Refusal>{pauseError}</Refusal>
        </div>
      )}
      {replaced && (
        <p role="status" className="mt-2 text-label">
          <DoneMark>{t('keyReplaced')}</DoneMark>
        </p>
      )}
      {replacing && mayKey && (
        <div className="mt-3 rounded-card border border-line p-4">
          <KeyFields entry={entry} replaceId={c.id} state={replaceState}>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              loading={replaceState.pending}
              loadingLabel={t('testPending')}
            >
              {t('testReplace')}
            </Button>
          </KeyFields>
        </div>
      )}
    </div>
  );
}

type View = 'connect' | 'manage' | 'done' | 'redone';

export type ToolDialogProps = {
  entry: CatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé quand le panneau s'est fermé sans pouvoir rendre le focus (ce qui l'a ouvert a disparu) : event.preventDefault() puis votre focus. */
  onCloseAutoFocus?: (e: Event) => void;
  /** Les connexions de cet outil. */
  conns: ConnectionView[];
  viewerId: string;
  now: Date;
  canConnect: boolean;
  /** Change à chaque ouverture : l'état du panneau repart de zéro. */
  session: number;
  /** La page où le retour de l'éditeur revient (le formulaire poste `retour`) ; absente : Connexions. */
  returnTo?: OAuthReturnPath;
  /** Les groupes de l'organisation : avec eux, le créateur choisit qui voit ce qu'une connexion relève. */
  groups?: GroupOption[];
  /** Le retour de l'éditeur pour cet outil (`?erreur=…&outil=`), dit en tête du panneau. */
  notice?: OAuthNotice | null;
  /** Le lien d'accord de l'administrateur, quand le retour le demande (Outlook). */
  consentUrl?: string | null;
  /** Ouvert au retour d'un branchement réussi (`?branche=`) : « … est branché ». */
  justConnected?: boolean;
  /** Propriétaire ou administrateur : GitHub mène au choix des dépôts d'équipe (Réglages). */
  mayChooseRepos?: boolean;
};

export function ToolDialog(props: ToolDialogProps) {
  const { open, onCloseAutoFocus } = props;
  // Le panneau rend le focus à ce qui l'a ouvert ; si ce n'est plus là (la tuile est devenue une carte), l'écran choisit.
  const was = useRef(open);
  useEffect(() => {
    if (was.current && !open && onCloseAutoFocus) {
      const id = setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body) onCloseAutoFocus(new Event('closeautofocus'));
      }, 320);
      was.current = open;
      return () => clearTimeout(id);
    }
    was.current = open;
  }, [open, onCloseAutoFocus]);
  if (!props.entry) return null;
  return <ToolPanel key={`${props.entry.id}-${props.session}`} {...props} entry={props.entry} />;
}

function ToolPanel({
  entry,
  open,
  onOpenChange,
  conns,
  viewerId,
  now,
  canConnect,
  returnTo,
  groups,
  notice,
  consentUrl,
  justConnected,
  mayChooseRepos,
}: ToolDialogProps & { entry: CatalogItem }) {
  const t = useTranslations('connections');
  const common = useTranslations('common');
  const locale = useLocale();
  const mode = panelMode(entry);
  const [view, setView] = useState<View>(
    justConnected ? 'done' : conns.length === 0 ? 'connect' : 'manage',
  );
  const [asking, setAsking] = useState<ConnectionView | null>(null);
  const [deleting, startDelete] = useTransition();
  const [leaving, leave] = useLeaving();
  const oauthForm = useRef<HTMLFormElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  // une clé en cours de test (coller une clé, remplacer une clé) : le panneau ne se ferme pas avant la réponse
  const [testing, setTesting] = useState(false);
  const connectKey = useKeySubmit({ entry, onSuccess: () => setView('done') });
  // la connexion en panne de la personne : le bouton d'encre du pied la reconnecte
  const repairTarget = canConnect
    ? conns.find((c) => c.isCreator && !c.creatorLeft && c.status === 'error')
    : undefined;
  const repairOauth = repairTarget ? canReconnect(repairTarget) : false;
  const repairKey = useKeySubmit({
    entry,
    replaceId: repairTarget?.id,
    onSuccess: () => setView(repairTarget?.status === 'paused' ? 'manage' : 'redone'),
  });
  const shownNotice = notice && notice.tool === entry.id && !justConnected ? notice : null;
  const github = entry.id === 'github';
  const others = otherOwnersNote(conns, viewerId, locale);

  // Le focus d'ouverture : sans champ à remplir avant, « Se connecter avec … » (le panneau viserait la période) ;
  // une clé à ressaisir, son champ (le panneau viserait « Qui voit »). Le panneau se monte une image plus tard
  // (portail) et pose d'abord son propre focus : on attend qu'il soit là, puis on le déplace.
  const lateFocus =
    view === 'connect' &&
    canConnect &&
    mode.startsWith('oauth') &&
    entry.oauthPreFields.length === 0
      ? 'continue'
      : view === 'manage' && repairTarget && !repairOauth
        ? 'repair'
        : null;
  useEffect(() => {
    if (!lateFocus) return;
    let id = 0;
    let seen = 0;
    let tries = 0;
    const go = () => {
      const el =
        lateFocus === 'continue'
          ? continueRef.current
          : document.querySelector<HTMLElement>('#repair-key :is(input, textarea)');
      if (el && ++seen > 2) el.focus();
      else if (++tries < 60) id = requestAnimationFrame(go);
    };
    id = requestAnimationFrame(go);
    return () => cancelAnimationFrame(id);
  }, [lateFocus]);

  const remove = (c: ConnectionView) =>
    startDelete(async () => {
      let ok = false;
      try {
        ok = (await deleteConnectionAction(c.id)).ok;
      } catch {
        toast.error(t('syncUnavailable'));
        return;
      }
      setAsking(null);
      if (!ok) {
        toast.error(t('connectionMissing'));
        return;
      }
      toast.success(t('connectionDeleted'));
      if (conns.length <= 1) onOpenChange(false);
    });

  const notNow =
    conns.length > 0 ? (
      <Button variant="quiet" onClick={() => setView('manage')}>
        {t('notNow')}
      </Button>
    ) : null;

  let body: ReactNode;
  let foot: ReactNode;
  let note: ReactNode;

  if (view === 'done' || view === 'redone') {
    body = (
      <>
        <PanelDone
          title={t(view === 'done' ? 'connectedDone' : 'reconnectedDone', {
            provider: entry.label,
          })}
        >
          {t(view === 'done' ? 'firstSyncSoon' : 'nextSyncSoon')}
        </PanelDone>
        <Facts>
          <Fact label={t('visibleTo')}>
            {github || !entry.privateRaw ? t('team') : t('onlyYou')}
            {github && <small>{t('githubScope')}</small>}
          </Fact>
        </Facts>
      </>
    );
    foot = (
      <>
        <PanelClose asChild>
          <Button variant="primary">{common('done')}</Button>
        </PanelClose>
        {conns.length > 0 && <Button onClick={() => setView('manage')}>{t('manage')}</Button>}
      </>
    );
  } else if (view === 'connect') {
    body = (
      <div className="grid gap-5">
        {shownNotice && <ReturnLine notice={shownNotice} consentUrl={consentUrl ?? null} />}
        {entry.warning && <Notice tone="warning">{nb(entry.warning)}</Notice>}
        <Facts>
          <Fact label={t('whoWillSee')}>
            {github || !entry.privateRaw ? t('team') : t('onlyYou')}
            <small>
              {nb(
                github ? t('githubScope') : entry.privateRaw ? t('privateTool') : t('sharedTool'),
              )}
            </small>
          </Fact>
        </Facts>
        {!canConnect ? (
          <PanelNote>{nb(t('connectorsUnavailable'))}</PanelNote>
        ) : mode === 'none' ? (
          <PanelNote>{nb(t('unconfiguredApp', { provider: entry.label }))}</PanelNote>
        ) : mode === 'key' ? (
          <KeyFields entry={entry} id="connect-key" state={connectKey} />
        ) : (
          <>
            <OAuthFields
              entry={entry}
              id="oauth-form"
              ref={oauthForm}
              returnTo={returnTo}
              onLeave={leave}
            />
            {mode === 'oauth+key' && (
              <PasteKey
                entry={entry}
                shared={oauthForm}
                onAdded={() => setView('done')}
                onPending={setTesting}
              />
            )}
          </>
        )}
        {canConnect && others && (
          <p className={SMALL}>{nb(`${others} ${t('duplicateWarning')}`)}</p>
        )}
        {canConnect && mode !== 'key' && entry.adminConsentUrl && !shownNotice?.adminConsent && (
          <AdminConsentLine url={entry.adminConsentUrl} />
        )}
        {!entry.triedForReal && <p className={SMALL}>{nb(t('notTested'))}</p>}
      </div>
    );
    if (canConnect && mode === 'key') {
      foot = (
        <>
          <Button
            type="submit"
            form="connect-key"
            variant="primary"
            loading={connectKey.pending}
            loadingLabel={t('testPending')}
          >
            {t('testConnect')}
          </Button>
          {notNow}
        </>
      );
      note = t('keyNote');
    } else if (canConnect && mode !== 'none') {
      foot = (
        <>
          <Button
            ref={continueRef}
            type="submit"
            form="oauth-form"
            variant="primary"
            loading={leaving}
            loadingLabel={t('opening', { provider: entry.label })}
          >
            {t('connectWith', { provider: entry.label })}
          </Button>
          {notNow}
        </>
      );
      note = t('passwordNote');
    } else foot = notNow ?? undefined;
  } else {
    const single = conns.length === 1 ? conns[0] : undefined;
    body = (
      <div className="grid gap-5">
        {shownNotice && <ReturnLine notice={shownNotice} consentUrl={consentUrl ?? null} />}
        <div className="grid gap-8">
          {conns.map((c, i) => (
            <div key={c.id} className={cn(i > 0 && 'border-t border-line pt-8')}>
              <ConnectionBlock
                c={c}
                entry={entry}
                now={now}
                groups={groups}
                canConnect={canConnect}
                repair={c.id === repairTarget?.id}
                repairKey={repairKey}
                heading={conns.length > 1 ? blockHeading(c, conns) : undefined}
                returnTo={returnTo}
                mayChooseRepos={mayChooseRepos}
                onAskDelete={() => setAsking(c)}
                onPending={setTesting}
                // la première ligne d'état prend le focus du panneau : pas « Synchroniser maintenant », qu'un Entrée
                // distrait lancerait (une clé à ressaisir le prend, elle)
                focusMe={i === 0 && !(repairTarget && !repairOauth)}
              />
            </div>
          ))}
        </div>
        {canConnect && (
          <div className="cx-acts mt-0">
            <Button
              variant="quiet"
              icon={Plus}
              className="cx-act"
              onClick={() => setView('connect')}
            >
              {t('another', { provider: entry.label })}
            </Button>
          </div>
        )}
        {entry.warning && <Notice tone="warning">{nb(entry.warning)}</Notice>}
        {!entry.triedForReal && <p className={SMALL}>{nb(t('notTested'))}</p>}
      </div>
    );
    const del = single?.canManage && (
      <Button variant="quiet" className="-ml-4" onClick={() => setAsking(single)}>
        {t('deleteConnection')}
      </Button>
    );
    if (repairTarget && (!repairOauth || entry.oauthReady)) {
      foot = (
        <>
          <Button
            type="submit"
            form={repairOauth ? 'reconnect' : 'repair-key'}
            variant="primary"
            loading={repairOauth ? leaving : repairKey.pending}
            loadingLabel={repairOauth ? t('opening', { provider: entry.label }) : t('testPending')}
            onClick={repairOauth ? leave : undefined}
          >
            {t('reconnect')}
          </Button>
          <PanelClose asChild>
            <Button variant="quiet">{t('notNow')}</Button>
          </PanelClose>
          {single?.canManage && (
            <Button variant="quiet" className="ml-auto -mr-4" onClick={() => setAsking(single)}>
              {t('deleteConnection')}
            </Button>
          )}
        </>
      );
      note = repairOauth ? t('passwordNote') : t('keyNote');
    } else
      foot = (
        <>
          {del}
          <PanelClose asChild>
            <Button className="ml-auto">{common('done')}</Button>
          </PanelClose>
        </>
      );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<ToolLogo kind={entry.id} size={44} />}
      // Le trait du dessin de l'écran, dans la tête du panneau : le nom de l'outil, relié (ou pas encore) au point de Leon.
      title={
        <span className="cx-head">
          {entry.label}
          <span
            aria-hidden="true"
            className="cx-link"
            data-state={
              view === 'done' || view === 'redone'
                ? 'fresh'
                : conns.length === 0
                  ? 'none'
                  : toolState(conns)
            }
          >
            <i />
          </span>
        </span>
      }
      sub={t(`family.${entry.family}`)}
      foot={foot}
      note={note}
      locked={connectKey.pending || repairKey.pending || testing}
      confirm={
        asking
          ? {
              title: t('deleteTitle', { name: asking.label }),
              text: t('deleteConfirm', {
                provider: entry.label,
                credential: canReconnect(asking) ? t('tokens') : t('key'),
              }),
              yes: t('delete'),
              no: t('keepIt'),
              busy: deleting,
              busyLabel: t('deleting'),
              onYes: () => remove(asking),
              onNo: () => setAsking(null),
            }
          : null
      }
    >
      {body}
    </SidePanel>
  );
}

/** Le retour de l'éditeur pour cet outil, en tête du panneau ; le lien d'accord de l'administrateur quand il le faut. */
function ReturnLine({ notice, consentUrl }: { notice: OAuthNotice; consentUrl: string | null }) {
  const t = useTranslations('connections');
  return (
    <Notice
      tone={notice.tone === 'success' ? 'success' : 'error'}
      live={notice.tone === 'success' ? 'status' : 'alert'}
    >
      {nb(notice.text)}
      {notice.adminConsent && consentUrl && (
        <>
          {' '}
          <External href={consentUrl}>{t('adminConsent')}</External>
        </>
      )}
    </Notice>
  );
}
