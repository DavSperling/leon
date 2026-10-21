import { motion } from 'motion/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, CopyButton, DialogClose, DialogContent, DialogFooter, Field, Input, Notice } from '@/components';
import { createToken, type PersonalToken } from '@/data';
import { duration, ease, nb, wait } from '@/lib';

/** États de démonstration de la fenêtre (?creer=…). */
export type CreateDemo = 'erreur' | 'envoi' | 'cree';
export const CREATE_DEMOS: readonly string[] = ['erreur', 'envoi', 'cree'];

const DESCRIPTION = 'Un jeton donne accès à ce que vous voyez. Il n’est montré qu’une fois.';
const NAME_ERROR = 'Donnez un nom à l’appareil (80 caractères au plus).';
const DEMO_NAME = 'MacBook Air de David';
// createToken() dérive l'id du nom : deux jetons du même nom auraient la même clé dans la liste
let seq = 0;

/** L'étape 2 entre en fondu : le changement d'état se voit, sans rien retenir. */
const step = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: duration.enter, ease: ease.out } };

/**
 * Création d'un jeton, en deux étapes, comme le vrai Leon : pas de croix, un clic dehors ne fait rien ; Échap annule à
 * l'étape 1 seulement (à l'étape 2, le jeton ne doit pas se perdre : « Terminé » ferme). Montez-la avec une `key` neuve
 * à chaque ouverture : l'état repart de zéro.
 */
export function CreateTokenContent({ open, demo, onCreated }: { open: boolean; demo?: CreateDemo; onCreated: (token: PersonalToken) => void }) {
  const [name, setName] = useState(demo === 'envoi' || demo === 'cree' ? DEMO_NAME : '');
  const [error, setError] = useState(demo === 'erreur' ? NAME_ERROR : undefined);
  const [pending, setPending] = useState(demo === 'envoi');
  const [secret, setSecret] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<AbortController>(null);
  // fermer la fenêtre (Échap, « Annuler ») ou quitter la page pendant « Envoi… » abandonne la création
  useEffect(() => () => pendingRef.current?.abort(), [open]);

  const create = (n: string) => {
    const made = createToken(n);
    setSecret(made.secret);
    onCreated({ ...made.token, id: `${made.token.id}-${++seq}` });
  };
  // ?creer=cree : la fenêtre s'ouvre sur l'étape 2 (le jeton rejoint la liste à la fermeture, comme après une vraie création)
  useEffect(() => {
    if (demo === 'cree') create(DEMO_NAME);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const n = name.trim();
    if (!n || n.length > 80) {
      setError(NAME_ERROR);
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    setPending(true);
    pendingRef.current = new AbortController();
    if (await wait(400, pendingRef.current.signal)) create(n);
  };

  return (
    <DialogContent
      size="sm"
      hideClose
      dismissible={false}
      onEscapeKeyDown={(e) => secret && e.preventDefault()}
      title={secret ? 'Jeton créé' : 'Créer un jeton'}
      description={nb(secret ? 'Collez-le dans l’outil à brancher.' : DESCRIPTION)}
    >
      {secret ? (
        <motion.div key="cree" className="grid gap-4" {...step}>
          <div className="grid gap-2.5">
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">{secret}</code>
            <Notice tone="warning" live="status" className="py-2.5">Copiez-le maintenant : il ne sera plus affiché.</Notice>
          </div>
          <DialogFooter>
            <CopyButton value={secret} size="md" autoFocus />
            <DialogClose asChild><Button variant="primary">Terminé</Button></DialogClose>
          </DialogFooter>
        </motion.div>
      ) : (
        <form noValidate onSubmit={submit} className="grid gap-5">
          {/* annoncée même si le focus est déjà dans le champ (Entrée), comme le role="alert" du vrai Leon */}
          <p role="alert" className="sr-only">{error}</p>
          <Field label="Nom de l’appareil" error={error}>
            <Input ref={inputRef} name="nom" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose>
            <Button type="submit" variant="primary" loading={pending}>{pending ? 'Envoi…' : 'Créer le jeton'}</Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
