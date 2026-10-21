import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Field, Input, Notice } from '@/components';
import { ME, ORG } from '@/data';
import { enter, exit, fade, nb, wait } from '@/lib';

// Formulaires de connexion et d'inscription : mêmes champs, messages et règles que le vrai Leon
// (app/(auth)/actions.ts) ; le serveur est simulé d'après l'adresse e-mail.

export type AuthPage = 'connexion' | 'inscription';
type Name = 'name' | 'email' | 'password' | 'organizationName';
type Values = Record<Name, string>;
type Errors = Partial<Record<Name | 'form', string>>;
type FieldDef = { name: Name; label: string; type: 'text' | 'email' | 'password'; autoComplete: string; hint?: string };

const FIELDS: Record<AuthPage, FieldDef[]> = {
  connexion: [
    { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Mot de passe', type: 'password', autoComplete: 'current-password' },
  ],
  inscription: [
    { name: 'name', label: 'Nom', type: 'text', autoComplete: 'name' },
    { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Mot de passe', type: 'password', autoComplete: 'new-password', hint: '8 caractères minimum.' },
    { name: 'organizationName', label: 'Nom de l’entreprise', type: 'text', autoComplete: 'organization', hint: 'Crée l’espace de votre équipe.' },
  ],
};

const COPY = {
  connexion: { title: 'Se connecter', submit: 'Se connecter', footer: 'Pas encore de compte ?', other: 'Créer un espace', to: '/inscription' },
  inscription: { title: 'Créer un espace', submit: 'Créer l’espace', footer: 'Déjà un compte ?', other: 'Se connecter', to: '/connexion' },
} as const;

const INVALID_EMAIL = 'Saisissez une adresse e-mail valide.';
const TOO_MANY = 'Trop de tentatives. Réessayez dans quelques minutes.';
const WRONG = 'E-mail ou mot de passe incorrect.';
const TAKEN = 'Cette adresse e-mail est déjà utilisée.';
const SIGN_UP_FAILED = 'Impossible de créer le compte. Réessayez.';
const SIGNED_UP_NOT_IN = 'Compte créé, mais la connexion a échoué. Connectez-vous.';

// Le motif de z.email() (zod 4), celui du vrai serveur.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

function validate(page: AuthPage, v: Values): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  const org = v.organizationName.trim();
  if (page === 'inscription' && (name.length < 1 || name.length > 100)) e.name = 'Indiquez votre nom.';
  if (!EMAIL.test(v.email.trim())) e.email = INVALID_EMAIL;
  if (page === 'connexion' && v.password.length < 1) e.password = 'Saisissez votre mot de passe.';
  if (page === 'inscription' && (v.password.length < 8 || v.password.length > 128)) e.password = 'Le mot de passe doit contenir entre 8 et 128 caractères.';
  if (page === 'inscription' && (org.length < 2 || org.length > 100)) e.organizationName = 'Indiquez le nom de votre entreprise (2 à 100 caractères).';
  return e;
}

/** Serveur simulé : null = succès (on part vers l'accueil). */
function server(page: AuthPage, email: string): Errors | null {
  const e = email.trim().toLowerCase();
  if (e === 'bloque@acme.fr') return { form: TOO_MANY };
  if (page === 'connexion') return e === 'erreur@acme.fr' ? { form: WRONG } : null;
  if (e === 'pris@acme.fr') return { email: TAKEN };
  if (e === 'erreur@acme.fr') return { form: SIGN_UP_FAILED };
  if (e === 'echec@acme.fr') return { form: SIGNED_UP_NOT_IN };
  return null;
}

console.assert(
  Object.keys(validate('inscription', { name: ' ', email: 'a@b', password: 'x'.repeat(7), organizationName: 'A' })).length === 4 &&
    Object.keys(validate('connexion', { name: '', email: 'david@acme.fr', password: 'p', organizationName: '' })).length === 0 &&
    server('inscription', 'Pris@acme.fr ')?.email === TAKEN && server('connexion', 'pris@acme.fr') === null,
  'auth-form : validation ou serveur simulé incorrects',
);

type Demo = { values: Values; errors?: Errors; pending?: boolean; visible?: boolean; focus?: Name };
const EMPTY: Values = { name: '', email: '', password: '', organizationName: '' };
const FILLED: Values = { name: ME.name, email: ME.email, password: 'zephyr-2027', organizationName: ORG.name };

/** État de départ : ?etat=… (démonstration), sinon l'adresse transmise par l'inscription (« Connectez-vous »). */
function initial(page: AuthPage, etat: string | null, email: unknown): Demo {
  const at = (mail: string, errors: Errors | null): Demo => ({ values: { ...FILLED, email: mail, password: '' }, errors: errors ?? {} });
  switch (etat) {
    case 'envoi': return { values: FILLED, pending: true };
    case 'voir': return { values: FILLED, visible: true };
    case 'erreurs': {
      const values = page === 'connexion' ? { ...EMPTY, email: 'david@acme' } : { name: '', email: 'david@acme', password: 'zephyr', organizationName: 'A' };
      return { values, errors: validate(page, values) };
    }
    case 'bloque': return at('bloque@acme.fr', server(page, 'bloque@acme.fr'));
  }
  // comme après un vrai refus : le mot de passe vidé reçoit le focus
  if (page === 'connexion' && etat === 'incorrect') return { ...at('erreur@acme.fr', server(page, 'erreur@acme.fr')), focus: 'password' };
  if (page === 'inscription' && etat === 'pris') return at('pris@acme.fr', server(page, 'pris@acme.fr'));
  if (page === 'inscription' && etat === 'echec') return at('erreur@acme.fr', server(page, 'erreur@acme.fr'));
  if (page === 'inscription' && etat === 'connexion-echouee') return at('echec@acme.fr', server(page, 'echec@acme.fr'));
  // arrivée depuis « Compte créé, mais la connexion a échoué » : l'adresse est remplie, reste le mot de passe
  if (typeof email === 'string' && email) return { values: { ...EMPTY, email }, focus: 'password' };
  return { values: EMPTY };
}

// Un avis qui s'ouvre pousse le bouton et le pied vers le bas : ils glissent (transform) au lieu de sauter.
const slide = { layout: 'position', transition: { layout: enter } } as const;
const noticeIn = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, transition: exit },
};
// Champ en erreur et focalisé : l'anneau de focus du système revient (la bordure rouge seule ne change pas) ;
// 16,5 px sur écran tactile, sinon iOS zoome la page au premier toucher.
const CONTROL_FIX = 'pointer-coarse:text-title aria-invalid:focus-visible:outline-solid';

/**
 * `shown` (tenu par la mise en page, qui survit au passage connexion ↔ inscription) : la page montrée avant celle-ci.
 * Au passage d'une page à l'autre, le focus va au nouveau titre ; à l'arrivée sans ?etat, au premier champ.
 */
export function AuthForm({ page, etat, shown }: { page: AuthPage; etat: string | null; shown: { current: AuthPage | null } }) {
  const copy = COPY[page];
  const navigate = useNavigate();
  const location = useLocation();
  const [start] = useState(() => initial(page, etat, (location.state as { email?: unknown } | null)?.email));
  const [values, setValues] = useState(start.values);
  const [errors, setErrors] = useState<Errors>(start.errors ?? {});
  const [pending, setPending] = useState(start.pending ?? false);
  const [visible, setVisible] = useState(start.visible ?? false);
  // lu au premier rendu, avant que l'effet ne mette `shown` à jour
  const [switched] = useState(() => shown.current !== null && shown.current !== page);
  const [focusReq, setFocusReq] = useState<{ name: Name } | null>(() =>
    start.focus ? { name: start.focus } : start.errors ? firstError(page, start.errors) : etat || switched ? null : { name: FIELDS[page][0].name },
  );
  const [pwId, setPwId] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const [pwScope, animate] = useAnimate<HTMLDivElement>();
  const alive = useRef<AbortController>(null);

  useEffect(() => {
    if (!start.focus && switched) titleRef.current?.focus({ preventScroll: true });
    shown.current = page;
    const ctl = new AbortController();
    alive.current = ctl;
    return () => ctl.abort();
  }, [page, shown, start.focus, switched]);

  useLayoutEffect(() => setPwId(pwRef.current?.id), []);

  // Le focus va au premier champ en erreur, une fois l'erreur rendue (aria-invalid et aria-describedby posés).
  // Image suivante : après le focus que l'ossature pose sur <main> en changeant de page.
  useEffect(() => {
    if (!focusReq) return;
    const raf = requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${focusReq.name}"]`)?.focus());
    return () => cancelAnimationFrame(raf);
  }, [focusReq]);

  const change = (name: Name, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _gone, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const invalid = validate(page, values);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setFocusReq(firstError(page, invalid));
      return;
    }
    setErrors({});
    setPending(true);
    if (!(await wait(600, alive.current?.signal))) return;
    const refused = server(page, values.email);
    // remplace /connexion dans l'historique : « Précédent » ne ramène pas au formulaire
    if (!refused) return void navigate('/', { replace: true });
    setPending(false);
    // comme le vrai serveur : le mot de passe ne revient jamais, il faut le retaper
    setValues((v) => ({ ...v, password: '' }));
    setErrors(refused);
    if (refused.form === WRONG) {
      setFocusReq({ name: 'password' });
      if (pwScope.current) animate(pwScope.current, { x: [0, -7, 6, -4, 3, -1, 0] }, { duration: 0.42, ease: 'easeOut' });
    } else if (!refused.form) setFocusReq(firstError(page, refused));
  }

  return (
    // Passage connexion ↔ inscription : le contenu sort et entre en un seul fondu.
    <motion.div variants={fade} initial="initial" animate="animate" exit="exit">
      <h1 ref={titleRef} tabIndex={-1} className="text-h1 font-semibold tracking-[-0.025em] text-fg outline-none">
        {copy.title}
      </h1>

      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 grid gap-4">
        {FIELDS[page].map((f) => {
          const isPw = f.type === 'password';
          return (
            <div key={f.name} ref={isPw ? pwScope : undefined}>
              <Field label={f.label} help={f.hint} error={errors[f.name]}>
                {isPw ? (
                  <div className="relative">
                    <Input
                      ref={pwRef}
                      name={f.name}
                      type={visible ? 'text' : 'password'}
                      autoComplete={f.autoComplete}
                      value={values.password}
                      onChange={(e) => change('password', e.target.value)}
                      spellCheck={false}
                      className={`pr-[84px] ${CONTROL_FIX}`}
                    />
                    <button
                      type="button"
                      aria-controls={pwId}
                      aria-label={visible ? 'Masquer le mot de passe' : 'Voir le mot de passe'}
                      onClick={() => setVisible((v) => !v)}
                      className="absolute inset-y-1 right-1 min-w-[68px] rounded-chip px-3 text-label font-semibold text-accent transition-colors duration-150 hover:bg-hover"
                    >
                      {visible ? 'Masquer' : 'Voir'}
                    </button>
                  </div>
                ) : (
                  <Input
                    name={f.name}
                    type={f.type}
                    autoComplete={f.autoComplete}
                    value={values[f.name]}
                    onChange={(e) => change(f.name, e.target.value)}
                    className={CONTROL_FIX}
                    {...(f.type === 'email' ? { inputMode: 'email', autoCapitalize: 'none', spellCheck: false } : {})}
                  />
                )}
              </Field>
            </div>
          );
        })}

        <AnimatePresence initial={false}>
          {errors.form && (
            <motion.div key={errors.form} {...noticeIn}>
              <Notice
                tone="error"
                live="alert"
                action={errors.form === SIGNED_UP_NOT_IN ? (
                  <Button asChild size="sm"><Link to="/connexion" state={{ email: values.email.trim() }}>Se connecter</Link></Button>
                ) : undefined}
              >
                {errors.form}
              </Notice>
            </motion.div>
          )}
        </AnimatePresence>

        <span role="status" className="sr-only">{pending ? 'Envoi…' : ''}</span>
        <motion.div {...slide} className="pt-1">
          <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
            {pending ? 'Envoi…' : copy.submit}
          </Button>
        </motion.div>
      </form>

      <motion.p {...slide} className="mt-6 border-t border-line pt-5 text-ui text-muted">
        {nb(copy.footer)}{' '}
        <Link to={copy.to} className="rounded-sm font-semibold text-accent underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent">
          {copy.other}
        </Link>
      </motion.p>
    </motion.div>
  );
}

function firstError(page: AuthPage, errors: Errors): { name: Name } | null {
  const f = FIELDS[page].find((x) => errors[x.name]);
  return f ? { name: f.name } : null;
}
