import { ArrowUpRight, ChevronDown, FlaskConical, LogIn, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertDialog, Beam, Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Dialog, DialogContent, Field, Input, Select, Textarea, toast, useThinking,
} from '@/components';
import { BACKFILL_DEFAULT, BACKFILL_OPTIONS, type CatalogField, type Connection, dialogDescription, getProvider, type Provider, type ProviderId } from '@/data';
import { cn, duration, ease, isInstant, nb, unfilter, wait } from '@/lib';
import { ADMIN_CONSENT, ADMIN_CONSENT_URL, OAUTH_PRE_FIELDS, othersNote, secretText, testKey } from './model';
import { ConnStatus, StatusText } from './parts';

// Fenêtre d'un outil (connection-panel du vrai Leon) : ses connexions, leurs boutons, puis de quoi en brancher une.

export type Essai = 'attente' | 'ok' | 'refus' | 'champs';
/** États de démonstration lus dans l'adresse (?cle=1, ?ajout=1, ?essai=…, ?remplacer=1, ?supprimer=1). */
export type DialogDemo = { cle?: boolean; ajout?: boolean; essai?: Essai; remplacer?: boolean; supprimer?: boolean };
export type Ops = {
  /** Branche une connexion par clé ; rend son id. */
  addKey: (provider: ProviderId, secret: string) => string;
  update: (id: string, patch: Partial<Connection>) => void;
  remove: (id: string) => void;
  /** Aller-retour simulé chez l'éditeur, puis retour sur ?retour=ok&outil=… */
  oauth: (provider: ProviderId, reconnectId?: string) => void;
};

const NEW_TAB = <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>;
const LINK = 'inline-flex items-center gap-0.5 rounded-sm font-medium text-accent underline-offset-4 decoration-accent-line hover:underline';
/** Premier arrêt d'un formulaire d'ajout : « Se connecter avec … » s'il existe, sinon le premier champ de la clé (jamais facultatif dans le catalogue). */
const firstStop = (root: HTMLElement | null | undefined) =>
  root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('form input, form textarea, form button[type=submit]');
const enterUp = { initial: { opacity: 0, y: 8, filter: 'blur(6px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.enter + 0.1, ease: ease.out }, transitionEnd: unfilter }, exit: { opacity: 0, scale: 0.98, transition: { duration: duration.exit } } };

function PeriodField({ disabled }: { disabled?: boolean }) {
  return (
    <Field label="Lire ce qui date de" help="Borne le premier passage, donc son coût.">
      <Select options={BACKFILL_OPTIONS} defaultValue={BACKFILL_DEFAULT} disabled={disabled} />
    </Field>
  );
}

function FieldInput({ field, disabled }: { field: CatalogField; disabled: boolean }) {
  const common = { name: field.name, placeholder: field.placeholder, disabled };
  return (
    <Field label={field.label} help={field.help}>
      {field.kind === 'list' ? (
        <Textarea {...common} rows={3} spellCheck={false} />
      ) : field.kind === 'select' ? (
        <Select name={field.name} options={field.options ?? []} defaultValue={field.options?.[0]?.value} disabled={disabled} />
      ) : (
        <Input {...common} type={field.kind === 'secret' ? 'password' : 'text'} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      )}
    </Field>
  );
}

type Result = { ok: string } | { error: string } | null;
function initialResult(p: Provider, essai: Essai | undefined, account: string | undefined, onlySecrets: boolean): Result {
  if (essai === 'ok' && account) return { ok: account };
  if (essai === 'refus') return { error: `Clé refusée par ${p.label}.` };
  if (essai === 'champs') return testKey(p.id, {}, onlySecrets) as { error: string };
  return null;
}

/** « Tester et brancher » / « Tester et remplacer » : rien n'est enregistré avant un test réussi ; la saisie s'efface après.
 *  `shared` : les champs communs (OAUTH_PRE_FIELDS) et la période sont déjà affichés au-dessus, une seule fois.
 *  `onSuccess` rend le compte à afficher (« Connecté : … », remplacement) ou rien (ajout : la fenêtre montre la nouvelle connexion). */
function KeyForm({ p, replace, shared, onSuccess, essai, essaiAccount, secondary }: { p: Provider; replace?: boolean; shared?: boolean; onSuccess: (values: Record<string, string>) => string | void; essai?: Essai; essaiAccount?: string; secondary?: boolean }) {
  const pre = shared ? OAUTH_PRE_FIELDS[p.id] ?? [] : [];
  const fields = replace ? p.fields.filter((x) => x.kind === 'secret') : p.fields.filter((x) => !pre.includes(x.name));
  const [pending, setPending] = useState(essai === 'attente');
  const [result, setResult] = useState<Result>(() => initialResult(p, essai, essaiAccount, Boolean(replace)));
  const { setThinking } = useThinking();
  const ctl = useRef<AbortController>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => setThinking(pending), [pending, setThinking]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const values = Object.fromEntries(fields.map((x) => [x.name, String(data.get(x.name) ?? '')]));
    // les champs se figent pendant le test : le focus passe au bouton (occupé mais focalisable) au lieu de tomber sur la page
    form.querySelector<HTMLButtonElement>('button[type=submit]')?.focus();
    setResult(null);
    setPending(true);
    ctl.current = new AbortController();
    const done = await wait(900, ctl.current.signal);
    if (!done) return;
    setPending(false);
    const r = testKey(p.id, values, Boolean(replace));
    if ('error' in r) {
      setResult(r);
      // une erreur ramène au champ à corriger (le premier secret vide, sinon la clé refusée)
      const bad = fields.find((x) => x.kind === 'secret' && !values[x.name]?.trim()) ?? fields.find((x) => x.kind === 'secret');
      requestAnimationFrame(() => form.querySelector<HTMLElement>(`[name="${bad?.name}"]`)?.focus());
      return;
    }
    const ok = onSuccess(values);
    if (ok) setResult({ ok });
    form.reset();
  };

  return (
    <Beam active={pending} className="rounded-box">
      <form onSubmit={submit} noValidate className="grid gap-4 rounded-box border border-line bg-glass-3 p-4 shadow-hi">
        {!replace && p.keyHelp && (
          <p className="text-ui text-fg-2">
            {nb(p.keyHelp)}{' '}
            <a href={p.docsUrl} target="_blank" rel="noreferrer" className={LINK}>
              Où trouver la clé<ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />{NEW_TAB}
            </a>
          </p>
        )}
        {fields.map((x) => <FieldInput key={x.name} field={x} disabled={pending} />)}
        {!replace && !shared && <PeriodField disabled={pending} />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" variant={secondary ? 'secondary' : 'primary'} size="sm" loading={pending} className="scroll-mb-8">
            {pending ? 'Test en cours…' : replace ? 'Tester et remplacer' : 'Tester et brancher'}
          </Button>
          <div aria-live="polite" className="min-w-0">
            <AnimatePresence mode="wait">
              {result && (
                <motion.div key={'ok' in result ? 'ok' : result.error} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  {'ok' in result ? <StatusText tone="success">{`Connecté : ${result.ok}`}</StatusText> : <StatusText tone="destructive">{result.error}</StatusText>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </Beam>
  );
}

/** « Se connecter avec … » : l'aller-retour chez l'éditeur est simulé (bouton occupé, puis retour sur la page). */
function OAuthForm({ p, onStart }: { p: Provider; onStart: () => void }) {
  const pre = OAUTH_PRE_FIELDS[p.id] ?? [];
  const [pending, setPending] = useState(false);
  const { setThinking } = useThinking();
  const ctl = useRef<AbortController>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setThinking(true);
    ctl.current = new AbortController();
    const ok = await wait(700, ctl.current.signal);
    setThinking(false);
    if (ok) onStart();
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      {p.oauthHelp && <p className="text-ui text-fg-2">{nb(p.oauthHelp)}</p>}
      {p.fields.filter((x) => pre.includes(x.name)).map((x) => <FieldInput key={x.name} field={x} disabled={pending} />)}
      <PeriodField disabled={pending} />
      <div><Button type="submit" variant="primary" icon={LogIn} loading={pending} data-autofocus>Se connecter avec {p.label}</Button></div>
      {p.id === 'outlook' && (
        <p className="text-label text-fg-2">
          {ADMIN_CONSENT}{' '}
          <a href={ADMIN_CONSENT_URL} target="_blank" rel="noreferrer" className={LINK}>
            Lien d’accord pour l’administrateur<ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />{NEW_TAB}
          </a>
        </p>
      )}
    </form>
  );
}

/** Bouton OAuth et « ou coller une clé » : les champs communs (pré-champs, période) une seule fois, dans le formulaire OAuth ;
 *  le volet de la clé n'a que ses propres champs (le secret) et « Tester et brancher ». */
function AddConnection({ p, oauthReady, ops, demo, onAdded }: { p: Provider; oauthReady: boolean; ops: Ops; demo: DialogDemo; onAdded: (id: string) => void }) {
  const oauth = oauthReady && p.oauth;
  const keyBox = useRef<HTMLDivElement>(null);
  // un seul bouton plein par vue : quand « Se connecter avec … » existe, le test de clé passe en secondaire
  const keyForm = (
    <KeyForm
      p={p}
      shared={oauth}
      secondary={oauth}
      onSuccess={(v) => onAdded(ops.addKey(p.id, v[p.fields.find((x) => x.kind === 'secret')?.name ?? ''] ?? ''))}
      essai={demo.remplacer || demo.essai === 'ok' ? undefined : demo.essai}
    />
  );
  // le volet s'ouvre : focus sur le secret, et « Tester et brancher » entre dans la partie visible de la fenêtre
  const onKeyOpen = (o: boolean) => o && requestAnimationFrame(() => {
    keyBox.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    keyBox.current?.querySelector('button[type=submit]')?.scrollIntoView({ block: 'nearest', behavior: isInstant() ? 'auto' : 'smooth' });
  });
  if (!oauth && !p.keyAccepted) return <p className="text-ui text-fg-2">{nb(`L’appli ${p.label} n’est pas encore configurée sur ce serveur.`)}</p>;
  if (!oauth) return keyForm;
  return (
    <div className="grid gap-5">
      <OAuthForm p={p} onStart={() => ops.oauth(p.id)} />
      {p.keyAccepted && (
        <Collapsible defaultOpen={demo.cle || (Boolean(demo.essai) && demo.essai !== 'ok' && !demo.remplacer)} onOpenChange={onKeyOpen} className="grid gap-3">
          <CollapsibleTrigger className={cn(LINK, 'group w-fit py-1 text-ui')}>
            ou coller une clé
            <ChevronDown aria-hidden="true" strokeWidth={1.8} className="ml-0.5 size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent ref={keyBox}>{keyForm}</CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function ConnectionCard({ c, p, canConnect, oauthReady, ops, demo, onRemoved }: { c: Connection; p: Provider; canConnect: boolean; oauthReady: boolean; ops: Ops; demo: DialogDemo; onRemoved: () => void }) {
  const [replacing, setReplacing] = useState(Boolean(demo.remplacer));
  const [reconnecting, setReconnecting] = useState(false);
  const ctl = useRef<AbortController>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const paused = c.status === 'paused';
  const oauth = c.via === 'oauth';
  const canSync = !paused && !c.creatorLeft;
  const reconnect = async () => {
    setReconnecting(true);
    ctl.current = new AbortController();
    if (await wait(900, ctl.current.signal)) ops.oauth(p.id, c.id);
  };
  return (
    <motion.li layout="position" {...enterUp} data-conn={c.id} tabIndex={-1} className="grid gap-3 rounded-card border border-line bg-glass-2 p-4 shadow-hi">
      <div className="grid gap-1">
        <p className="text-ui font-semibold break-words text-fg">{c.account}</p>
        <ConnStatus c={c} />
        <p className="font-mono text-meta tracking-normal text-muted">{secretText(c)}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" className="mr-1" disabled={!canSync} onClick={() => toast.success('Synchronisation demandée : elle démarre dans la minute.')}>Synchroniser maintenant</Button>
        <Button size="sm" variant="ghost" onClick={() => (ops.update(c.id, { status: paused ? 'active' : 'paused' }), toast.success(paused ? 'Connexion reprise.' : 'Connexion mise en pause.'))}>
          {paused ? 'Reprendre' : 'Mettre en pause'}
        </Button>
        {!c.creatorLeft && (oauth ? (
          <Button size="sm" variant="ghost" disabled={!canConnect || !oauthReady} loading={reconnecting} onClick={reconnect}>Reconnecter</Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={!canConnect} aria-expanded={replacing} onClick={() => setReplacing((o) => !o)}>Remplacer la clé</Button>
        ))}
        <AlertDialog
          defaultOpen={demo.supprimer}
          trigger={<Button size="sm" variant="ghost" icon={Trash2}>Supprimer</Button>}
          title={`Supprimer « ${c.account} » ?`}
          description={`Leon ne lira plus ${p.label} avec ${oauth ? 'ces jetons, qui sont effacés' : 'cette clé, qui est effacée'}. Les sources déjà captées restent dans la mémoire.`}
          confirmLabel="Supprimer"
          onConfirm={() => (ops.remove(c.id), toast.success('Connexion supprimée.'), onRemoved())}
        />
      </div>
      {oauth && canConnect && !oauthReady && !c.creatorLeft && <p className="text-label text-muted">{nb(`L’appli ${p.label} n’est plus configurée sur ce serveur : impossible de reconnecter.`)}</p>}
      {replacing && canConnect && !oauth && (
        <KeyForm
          p={p}
          replace
          essai={demo.remplacer ? demo.essai : undefined}
          essaiAccount={c.account}
          onSuccess={(v) => {
            const secret = v[p.fields.find((x) => x.kind === 'secret')?.name ?? ''] ?? '';
            ops.update(c.id, { secretHint: secret.replace(/\s+/g, '').slice(-4), ...(c.status === 'error' ? { status: 'active', lastError: undefined } : {}) });
            return c.account;
          }}
        />
      )}
    </motion.li>
  );
}

function Panel({ p, conns, canConnect, oauthReady, ops, demo, focusDialog }: { p: Provider; conns: Connection[]; canConnect: boolean; oauthReady: boolean; ops: Ops; demo: DialogDemo; focusDialog: () => void }) {
  const [adding, setAdding] = useState(conns.length === 0 || Boolean(demo.ajout || (demo.essai && demo.essai !== 'ok' && !demo.remplacer)));
  const [added, setAdded] = useState<string | null>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const userAdd = useRef(false);
  const others = othersNote(conns);
  // les états de démonstration visent la première connexion par clé (sinon la première)
  const target = conns.find((x) => x.via === 'key') ?? conns[0];
  const showAdd = canConnect && (conns.length === 0 || adding);
  useEffect(() => {
    // « Brancher une autre connexion » disparaît au clic : le focus passe à l'action principale du formulaire
    if (adding && userAdd.current) firstStop(addRef.current)?.focus();
  }, [adding]);
  useEffect(() => {
    // clé branchée : le formulaire se replie, la nouvelle connexion entre dans la partie visible et prend le focus (elle dit « Actif »)
    const el = added ? document.querySelector<HTMLElement>(`[data-conn="${added}"]`) : null;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', behavior: isInstant() ? 'auto' : 'smooth' });
  }, [added]);
  const onAdded = (id: string) => {
    setAdding(false);
    setAdded(id);
    toast.success(`${p.label} est branché.`);
  };
  return (
    <>
      {/* l'avertissement de l'éditeur (Outlook, Attio…), seul en ton d'alerte */}
      {p.warning && (
        <p className="flex gap-2 text-label text-fg-2">
          <TriangleAlert aria-hidden="true" strokeWidth={1.8} className="mt-[2px] size-3.5 shrink-0 text-warning" />
          {nb(p.warning)}
        </p>
      )}
      {conns.length > 0 && (
        <ul className="grid gap-3">
          <AnimatePresence initial={false}>
            {conns.map((c) => <ConnectionCard key={c.id} c={c} p={p} canConnect={canConnect} oauthReady={oauthReady} ops={ops} demo={c === target ? demo : {}} onRemoved={focusDialog} />)}
          </AnimatePresence>
        </ul>
      )}
      {!canConnect && <p className="text-ui text-fg-2">{nb('Les connecteurs ne sont pas configurés sur ce serveur : ajoutez LEON_CONNECTORS_KEY (voir .env.example), puis redémarrez Leon.')}</p>}
      {showAdd && (
        <motion.div ref={addRef} {...enterUp} className={cn('grid gap-4', conns.length > 0 && 'border-t border-line pt-5')}>
          {/* simple remarque au moment d'en ajouter une : qui l'a déjà branché se lit aussi sur chaque connexion */}
          {others && <p className="text-label text-muted">{nb(`${others} Évitez de brancher deux fois le même espace.`)}</p>}
          <AddConnection p={p} oauthReady={oauthReady} ops={ops} demo={demo} onAdded={onAdded} />
        </motion.div>
      )}
      {canConnect && conns.length > 0 && !adding && (
        <Button variant="ghost" size="sm" icon={Plus} className="w-fit" onClick={() => ((userAdd.current = true), setAdding(true))}>Brancher une autre connexion</Button>
      )}
      {/* l'étiquette du vrai Leon, ici seulement : une note discrète en pied de fenêtre plutôt qu'un badge sur chaque outil */}
      {!p.triedForReal && (
        <p className="flex items-start gap-1.5 text-label text-muted">
          <FlaskConical aria-hidden="true" strokeWidth={1.7} className="mt-[2px] size-3.5 shrink-0" />
          {nb('Non essayé en réel : ce connecteur n’a pas encore été testé sur un vrai compte.')}
        </p>
      )}
    </>
  );
}

export function ToolDialog({ provider, open, onOpenChange, onCloseAutoFocus, conns, canConnect, oauthReady, ops, demo, session }: {
  provider: ProviderId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (e: Event) => void;
  conns: Connection[];
  canConnect: boolean;
  oauthReady: boolean;
  ops: Ops;
  demo: DialogDemo;
  /** Change à chaque ouverture : l'état de la fenêtre repart de zéro. */
  session: number;
}) {
  const content = useRef<HTMLDivElement>(null);
  // après une suppression, le bouton qui avait le focus a disparu : on le rend à la fenêtre une fois la confirmation fermée
  const focusDialog = () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || a === document.body) content.current?.focus();
  }, 220);
  if (!provider) return null;
  const p = getProvider(provider);
  const mine = conns.filter((c) => c.provider === provider);
  // à l'ouverture : sans connexion, sur l'action principale (firstStop) ; avec, sur la fenêtre elle-même
  // (Radix viserait « Synchroniser maintenant », qu'un Entrée distrait lancerait)
  const autoFocus = (e: Event) => {
    e.preventDefault();
    const el = content.current;
    ((mine.length === 0 ? firstStop(el) : null) ?? el)?.focus();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        size="lg"
        onOpenAutoFocus={autoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        title={p.label}
        description={dialogDescription(p.id)}
      >
        <Panel key={`${provider}-${session}`} p={p} conns={mine} canConnect={canConnect} oauthReady={oauthReady} ops={ops} demo={demo} focusDialog={focusDialog} />
      </DialogContent>
    </Dialog>
  );
}
