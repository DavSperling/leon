'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState, useTransition } from 'react';
import { createInvitationAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  CopyButton,
  Fact,
  Facts,
  Field,
  Input,
  Notice,
  PanelClose,
  PanelDone,
  SidePanel,
} from '@/components/verre';
import { PlacementFields, usePlacementForm } from '@/components/verre/onboarding/placement-fields';
import { formatDate, nb } from '@/lib/verre';
import { ReportsTo } from './reports-to';
import { SendByEmail } from './send-by-email';

type Created = { url: string; expiresAt: Date; name: string };

/**
 * Inviter quelqu'un : son nom (pour s'y retrouver), son service, son poste, son niveau, et à qui il sera rattaché
 * (déjà choisi quand on vient du « + » d'une personne). Puis le lien, montré une seule fois : le panneau ne se ferme
 * plus que par « Terminé ». « Copier », ou « Envoyer par e-mail ». Remonté (`key`) à chaque ouverture : le lien
 * disparaît avec lui.
 */
export function InvitePanel({
  open,
  onOpenChange,
  managerId,
  people,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managerId: string | null;
  people: { id: string; name: string }[];
  workspace: string;
}) {
  const t = useTranslations('team');
  const n = useTranslations('onboarding.teammates');
  const s = useTranslations('settings');
  const locale = useLocale();
  const form = usePlacementForm();
  const [name, setName] = useState('');
  const [manager, setManager] = useState(managerId);
  const [created, setCreated] = useState<Created | null>(null);
  // le lien vient d'être créé : le focus va à son champ (le bouton d'envoi a disparu), sans faire défiler la page
  useEffect(() => {
    if (created) document.getElementById('lien-invitation')?.focus({ preventScroll: true });
  }, [created]);
  const [pending, startTransition] = useTransition();
  const { department, job, seniority } = form.placement;
  const ready = Boolean(department && job && seniority);
  const formError = form.text('form');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      try {
        const result = await createInvitationAction({
          name,
          ...form.placement,
          managerId: manager,
        });
        if ('errors' in result) form.reject(result.errors);
        else setCreated({ url: result.url, expiresAt: result.expiresAt, name: name.trim() });
      } catch {
        form.reject({ form: 'form' });
      }
    });
  };

  const title = workspace ? t('inviteTitle', { workspace }) : s('inviteMember');
  // Un seul panneau pour les deux étapes : il ne se referme pas entre le formulaire et le lien.
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      // verrouillé aussi pendant la création : fermer à ce moment-là ferait perdre le lien, montré une seule fois
      locked={created !== null || pending}
      foot={
        created ? (
          <PanelClose asChild>
            <Button variant="primary" className="ml-auto">
              {s('done')}
            </Button>
          </PanelClose>
        ) : (
          <>
            <Button
              type="submit"
              form="invitation"
              variant="primary"
              loading={pending}
              loadingLabel={t('creating')}
              disabled={!ready}
            >
              {t('createLink')}
            </Button>
            <PanelClose asChild>
              <Button variant="quiet">{t('cancel')}</Button>
            </PanelClose>
          </>
        )
      }
    >
      {created ? (
        <>
          <PanelDone title={s('inviteCreated')} />
          <div className="mt-5 grid gap-1.5">
            <label htmlFor="lien-invitation" className="text-label font-medium text-fg">
              {created.name ? t('linkFor', { name: created.name }) : t('link')}
            </label>
            <div className="flex gap-2">
              <Input
                id="lien-invitation"
                readOnly
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-1 px-3"
              />
              <CopyButton value={created.url} size="md" />
            </div>
            <p className="text-label text-muted">{nb(s('copyInvite'))}</p>
          </div>
          <Facts className="mt-4">
            <Fact label={t('works')}>{t('worksOnce')}</Fact>
            <Fact label={t('expires')}>{formatDate(created.expiresAt, locale)}</Fact>
          </Facts>
          <SendByEmail url={created.url} className="mt-6 border-t border-line pt-5" />
        </>
      ) : (
        <form
          id="invitation"
          ref={form.formRef}
          noValidate
          onSubmit={submit}
          className="grid gap-5"
        >
          <Field label={n('name')} error={form.text('name')}>
            <Input
              autoComplete="off"
              placeholder={n('namePlaceholder')}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                form.clear('name');
              }}
            />
          </Field>
          <PlacementFields {...form.fields} />
          <div className="grid gap-1.5">
            <span className="text-label font-medium text-fg">{t('reportsToLabel')}</span>
            <ReportsTo
              label={t('reportsToLabel')}
              value={manager}
              people={people}
              onChange={setManager}
            />
          </div>
          {formError && (
            <Notice tone="error" live="alert">
              {formError}
            </Notice>
          )}
        </form>
      )}
    </SidePanel>
  );
}
