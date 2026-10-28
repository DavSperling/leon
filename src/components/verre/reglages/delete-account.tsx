'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { deleteAccountAction, deleteOrganizationAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  Input,
  Notice,
  Section,
  Select,
} from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import type { DeletionInfo } from '@/server/auth/delete-account';
import { SECTION } from './reglages';

type Confirmation = { password: string; code: string; word: string };
type Run = (input: Confirmation, successorId: string | null) => Promise<{ error: string }>;

const read = (data: FormData, name: string) => String(data.get(name) ?? '');

type DeletionProps = {
  title: string;
  description: string;
  effects: string[];
  successors?: DeletionInfo['successors']; // présent seulement quand un nouveau propriétaire est obligatoire
  twoFactor: boolean;
  run: Run;
};

// Le bouton rouge et son dialogue. Les mêmes champs servent aux deux suppressions : seuls les textes, le choix du
// successeur et l'action appelée changent. En cas de succès, l'action ne rend pas : la page part vers la connexion.
function DeletionSection({ title, description, ...content }: DeletionProps) {
  // Une clé neuve à chaque ouverture : le mot de passe, le mot tapé et l'erreur ne survivent pas à la fermeture.
  const [session, setSession] = useState(0);
  return (
    <Section title={title} description={description} className={SECTION}>
      <Dialog onOpenChange={(open) => open && setSession((s) => s + 1)}>
        <DialogTrigger asChild>
          <Button variant="destructive">{title}</Button>
        </DialogTrigger>
        <DeletionContent key={session} title={title} {...content} />
      </Dialog>
    </Section>
  );
}

function DeletionContent({
  title,
  effects,
  successors,
  twoFactor,
  run,
}: Omit<DeletionProps, 'description'>) {
  const t = useTranslations('deleteAccount');
  const security = useTranslations('security');
  const settings = useTranslations('settings');
  const [word, setWord] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const ready = word.trim() === t('word') && (!successors || successorId !== '');

  return (
    <DialogContent size="md" title={title} description={t('irreversible')}>
      <ul className="grid list-disc gap-1.5 pl-5 text-ui text-fg-2">
        {effects.map((effect) => (
          <li key={effect}>{nb(effect)}</li>
        ))}
      </ul>
      <form
        action={(data) => {
          setError('');
          startTransition(async () => {
            const result = await run(
              {
                password: read(data, 'password'),
                code: read(data, 'code').replace(/\s/g, ''),
                word,
              },
              successorId || null,
            );
            setError(result.error);
          });
        }}
        className="grid gap-4"
      >
        {error && (
          <Notice tone="error" live="alert">
            {nb(error)}
          </Notice>
        )}
        {successors && (
          <Field label={t('successor')} help={t('successorHelp')}>
            <Select
              options={successors.map((member) => ({ value: member.userId, label: member.name }))}
              value={successorId}
              onValueChange={setSuccessorId}
              placeholder={t('successorPlaceholder')}
            />
          </Field>
        )}
        <Field label={security('password')}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {twoFactor && (
          <Field label={security('code')}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </Field>
        )}
        <Field label={nb(t('typeWord', { word: t('word') }))}>
          <Input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{settings('cancel')}</Button>
          </DialogClose>
          <Button type="submit" variant="destructive" loading={pending} disabled={!ready}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Bas de l'onglet Profil : supprimer son compte. Seul membre actif, c'est aussi supprimer l'organisation. */
export function DeleteAccountSection({
  info,
  twoFactor,
}: {
  info: DeletionInfo;
  twoFactor: boolean;
}) {
  const t = useTranslations('deleteAccount');
  const organization = info.organizationName;
  return (
    <DeletionSection
      title={t('title')}
      description={info.soleActiveMember ? t('descriptionSole') : t('description')}
      effects={
        info.soleActiveMember
          ? [t('effectLogin'), t('effectSole', { organization })]
          : [t('effectLogin'), t('effectTools'), t('effectStays', { organization })]
      }
      successors={info.needsSuccessor ? info.successors : undefined}
      twoFactor={twoFactor}
      run={(input, successorId) => deleteAccountAction({ ...input, successorId })}
    />
  );
}

/** Bas de l'onglet Équipe, pour le propriétaire seulement : supprimer l'organisation et tout ce qu'elle contient. */
export function DeleteOrganizationSection({
  info,
  twoFactor,
}: {
  info: DeletionInfo;
  twoFactor: boolean;
}) {
  const t = useTranslations('deleteOrganization');
  return (
    <DeletionSection
      title={t('title')}
      description={t('description')}
      effects={[
        t('effectAll', { organization: info.organizationName }),
        t('effectMembers', { count: info.activeMembers }),
      ]}
      twoFactor={twoFactor}
      run={(input) => deleteOrganizationAction(input)}
    />
  );
}
