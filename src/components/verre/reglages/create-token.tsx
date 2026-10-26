'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('settings');
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
      title={secret ? t('tokenCreated') : t('createToken')}
      description={nb(secret ? t('pasteToken') : t('tokenDescription'))}
    >
      {secret ? (
        <motion.div key="cree" className="grid gap-4" {...step}>
          <div className="grid gap-2.5">
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">
              {secret}
            </code>
            <Notice tone="warning" live="status" className="py-2.5">
              {t('copyToken')}
            </Notice>
          </div>
          <DialogFooter>
            <CopyButton value={secret} size="md" autoFocus />
            <DialogClose asChild>
              <Button variant="primary">{t('done')}</Button>
            </DialogClose>
          </DialogFooter>
        </motion.div>
      ) : (
        <form noValidate action={formAction} className="grid gap-5">
          <Field label={t('deviceName')} error={state.error}>
            <Input name="name" autoComplete="off" defaultValue={state.name} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('cancel')}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? t('sending') : t('createTokenSubmit')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
