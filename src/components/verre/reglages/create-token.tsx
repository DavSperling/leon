'use client';

import { motion } from 'motion/react';
import { useActionState } from 'react';
import { createTokenAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  CopyButton,
  DialogClose,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Notice,
} from '@/components/verre';
import { duration, ease, nb } from '@/lib/verre';

const DESCRIPTION = 'Un jeton donne accès à ce que vous voyez. Il n’est montré qu’une fois.';

/** L'étape 2 entre en fondu : le changement d'état se voit, sans rien retenir. */
const step = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.enter, ease: ease.out },
};

type State = { name: string; error?: string; token?: string };

/**
 * Création d'un jeton, en deux étapes : pas de croix, un clic dehors ne fait rien ; Échap annule à l'étape 1 seulement
 * (à l'étape 2, le jeton ne doit pas se perdre : « Terminé » ferme). Montez-la avec une `key` neuve à chaque ouverture :
 * le jeton en clair disparaît avec elle.
 */
export function CreateTokenContent({ onCreated }: { onCreated: (hint: string) => void }) {
  const [state, formAction, pending] = useActionState(
    async (_: State, data: FormData): Promise<State> => {
      const name = String(data.get('name') ?? '');
      const result = await createTokenAction(name);
      if ('error' in result) return { name, error: result.error };
      onCreated(result.hint);
      return { name, token: result.token };
    },
    { name: '' },
  );
  const secret = state.token;

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
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">
              {secret}
            </code>
            <Notice tone="warning" live="status" className="py-2.5">
              Copiez-le maintenant : il ne sera plus affiché.
            </Notice>
          </div>
          <DialogFooter>
            <CopyButton value={secret} size="md" autoFocus />
            <DialogClose asChild>
              <Button variant="primary">Terminé</Button>
            </DialogClose>
          </DialogFooter>
        </motion.div>
      ) : (
        <form noValidate action={formAction} className="grid gap-5">
          <Field label="Nom de l’appareil" error={state.error}>
            <Input name="name" autoComplete="off" defaultValue={state.name} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? 'Envoi…' : 'Créer le jeton'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
