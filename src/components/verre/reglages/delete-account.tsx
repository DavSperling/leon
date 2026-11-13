'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { deleteAccountAction, deleteOrganizationAction } from '@/app/(app)/reglages/actions';
import { Button, Field, Input, Notice, PanelClose, Select, SidePanel } from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import type { DeletionInfo } from '@/server/auth/delete-account';

type Confirmation = { password: string; code: string; word: string };
type Run = (input: Confirmation, successorId: string | null) => Promise<{ error: string }>;

const read = (data: FormData, name: string) => String(data.get(name) ?? '');

type DeletionProps = {
  title: string;
  effects: string[];
  successors?: DeletionInfo['successors']; // présent seulement quand un nouveau propriétaire est obligatoire
  twoFactor: boolean;
  run: Run;
};

// Le bouton discret sous la feuille, et son panneau. Les mêmes champs servent aux deux suppressions : seuls les textes,
// le choix du successeur et l'action appelée changent. En cas de succès, l'action ne rend pas : la page part vers la
// connexion (/connexion?supprime=…). Pas de vue « fait » : la redirection la rend impossible.
function Deletion(props: DeletionProps) {
  const [open, setOpen] = useState(false);
  // une clé neuve à chaque ouverture : le mot de passe, le mot tapé et l'erreur ne survivent pas à la fermeture
  const [session, setSession] = useState(0);
  return (
    <p className="mt-3">
      <Button
        variant="quiet"
        className="ml-2 hover:bg-destructive-soft hover:text-destructive max-sm:ml-0"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {props.title}
      </Button>
      <DeletionPanel key={session} open={open} onOpenChange={setOpen} {...props} />
    </p>
  );
}

function DeletionPanel({
  open,
  onOpenChange,
  title,
  effects,
  successors,
  twoFactor,
  run,
}: DeletionProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('deleteAccount');
  const security = useTranslations('security');
  const settings = useTranslations('settings');
  const id = useId();
  const [word, setWord] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const ready = word.trim() === t('word') && (!successors || successorId !== '');

  // chaque refus sous le champ qu'il concerne ; le reste (situation changée, échec) en tête du formulaire
  const at = {
    password: [security('wrongPassword'), security('tooManyAttempts')].includes(error),
    code: error === t('wrongCode'),
    word: error === t('wrongWord', { word: t('word') }),
  };
  const general = error && !at.password && !at.code && !at.word ? error : '';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    const data = new FormData(event.currentTarget);
    setError('');
    startTransition(async () => {
      // pas de catch : en cas de succès, la redirection de l'action passe par ici
      const result = await run(
        { password: read(data, 'password'), code: read(data, 'code').replace(/\s/g, ''), word },
        successorId || null,
      );
      setError(result.error);
    });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub={t('irreversible')}
      busy={pending}
      foot={
        <>
          <Button
            type="submit"
            form={`${id}-form`}
            variant="destructive"
            loading={pending}
            loadingLabel={t('deleting')}
            disabled={!ready}
          >
            {t('confirm')}
          </Button>
          <PanelClose asChild>
            <Button variant="quiet">{settings('cancel')}</Button>
          </PanelClose>
        </>
      }
    >
      <ul className="mb-5 grid list-disc gap-2 pl-[18px] text-ui leading-[1.5] text-fg-2 marker:text-icon">
        {effects.map((effect) => (
          <li key={effect}>{nb(effect)}</li>
        ))}
      </ul>
      <form id={`${id}-form`} noValidate onSubmit={submit} className="grid gap-3.5">
        {general && (
          <Notice tone="error" live="alert">
            {nb(general)}
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
        <Field label={security('password')} error={at.password ? nb(error) : undefined}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {twoFactor && (
          <Field label={security('code')} error={at.code ? error : undefined}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              className="max-w-[200px] tabular-nums"
            />
          </Field>
        )}
        <Field
          label={nb(t('typeWord', { word: t('word') }))}
          error={at.word ? nb(error) : undefined}
        >
          <Input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </form>
    </SidePanel>
  );
}

/** Sous la feuille Profil : supprimer son compte. Seul membre actif, c'est aussi supprimer l'organisation. */
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
    <Deletion
      title={t('title')}
      effects={
        info.soleActiveMember
          ? [t('effectLogin'), t('effectSole', { organization })]
          : [t('effectLogin'), t('effectTools'), t('effectStays', { organization })]
      }
      successors={info.needsSuccessor ? info.successors : undefined}
      twoFactor={twoFactor}
      // Ce que le panneau annonce part avec la demande : si l'équipe a changé entre-temps, le serveur refuse.
      run={(input, successorId) =>
        deleteAccountAction({ ...input, successorId, organizationToo: info.soleActiveMember })
      }
    />
  );
}

/** Sous la feuille Espace de travail, pour le propriétaire seulement : supprimer l'organisation et tout ce qu'elle contient. */
export function DeleteOrganizationSection({
  info,
  twoFactor,
}: {
  info: DeletionInfo;
  twoFactor: boolean;
}) {
  const t = useTranslations('deleteOrganization');
  return (
    <Deletion
      title={t('title')}
      effects={[
        t('effectAll', { organization: info.organizationName }),
        t('effectMembers', { count: info.activeMembers }),
      ]}
      twoFactor={twoFactor}
      run={(input) => deleteOrganizationAction(input)}
    />
  );
}
