'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState, useTransition } from 'react';
import { createInvitationAction, type PlacementInput } from '@/app/(app)/reglages/actions';
import { AuthNote } from '@/components/verre/auth/frame';
import { Button } from '@/components/verre/ui/button';
import { Field, Input } from '@/components/verre/ui/form';
import { PlacementFields, usePlacementForm } from './placement-fields';

export type CreatedInvitation = {
  url: string;
  expiresAt: Date;
  name: string;
  placement: PlacementInput;
};

/**
 * Le formulaire d'un lien d'invitation : un nom pour s'y retrouver (facultatif), puis service, poste et niveau de la
 * personne invitée (tous trois requis). Sert à l'étape Collaborateurs de l'onboarding (l'écran Équipe a son panneau : equipe/invite-panel.tsx).
 * `secondaryAction` (Annuler, Passer…) se place avant « Créer le lien ». `onDraft` reçoit ce qui est saisi, à mesure :
 * l'équipe dessinée à côté suit la frappe, sans rien envoyer.
 */
export function InviteForm({
  onCreated,
  onDraft,
  secondaryAction,
}: {
  onCreated: (invitation: CreatedInvitation) => void;
  onDraft?: (draft: { name: string; placement: PlacementInput }) => void;
  secondaryAction?: ReactNode;
}) {
  const t = useTranslations('onboarding.teammates');
  const form = usePlacementForm();
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const { department, job, seniority } = form.placement;
  const ready = Boolean(department && job && seniority);
  const formError = form.text('form');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `onDraft` change à chaque rendu de l'appelant ; seule la saisie compte
  useEffect(() => {
    onDraft?.({ name: name.trim(), placement: form.placement });
  }, [name, department, job, seniority]);

  // Pas de `action={…}` : React remet le formulaire à zéro après une action, et les listes (Radix Select) avec lui.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      try {
        const result = await createInvitationAction({ name, ...form.placement });
        if ('errors' in result) form.reject(result.errors);
        else
          onCreated({
            url: result.url,
            expiresAt: result.expiresAt,
            name: name.trim(),
            placement: form.placement,
          });
      } catch {
        form.reject({ form: 'form' });
      }
    });
  };

  return (
    <form ref={form.formRef} noValidate onSubmit={submit} className="grid gap-5">
      <Field label={t('name')} error={form.text('name')}>
        <Input
          autoComplete="off"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            form.clear('name');
          }}
        />
      </Field>

      <PlacementFields {...form.fields} />

      {formError && <AuthNote tone="error">{formError}</AuthNote>}

      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        {secondaryAction}
        <Button type="submit" variant="secondary" loading={pending} disabled={!ready}>
          {t('createLink')}
        </Button>
      </div>
    </form>
  );
}
