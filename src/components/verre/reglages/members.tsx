'use client';

import { Pencil, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { setMemberPlacementAction } from '@/app/(app)/reglages/actions';
import {
  Badge,
  Button,
  CopyButton,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  GlassCard,
  IconButton,
  Notice,
  Section,
} from '@/components/verre';
import { InviteForm } from '@/components/verre/onboarding/invite-form';
import { PlacementFields, usePlacementForm } from '@/components/verre/onboarding/placement-fields';
import { departmentLabelKey, jobLabelKey, seniorityId } from '@/lib/onboarding';
import { duration, ease, formatDate, nb } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';
import { SECTION } from './reglages';

// Better Auth peut ranger plusieurs rôles séparés par des virgules.
export const roleLabel = (role: string, labels: Record<string, string>) =>
  role
    .split(',')
    .map((r) => labels[r] ?? r)
    .join(', ');

const ROW =
  'relative flex min-h-[60px] items-center gap-4 rounded-field px-3 py-2.5 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line';

/** Section « Membres » : qui est dans l'espace et, pour un propriétaire ou un administrateur, l'invitation. */
export function MembersSection({
  members,
  canInvite,
}: {
  members: MemberRow[];
  canInvite: boolean;
}) {
  const [session, setSession] = useState(0);
  const t = useTranslations('settings');
  const o = useTranslations('onboarding');
  const active = members.filter((m) => !m.former);
  const former = members.filter((m) => m.former);

  // « poste · niveau · service », ce que la personne a de renseigné.
  const placementOf = (m: MemberRow) => {
    const level = seniorityId(m.seniority);
    const parts = [
      m.job && o(jobLabelKey(m.department, m.job)),
      level && o(`seniority.${level}`),
      m.department && o(departmentLabelKey(m.department)),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : t('placementNotSet');
  };

  return (
    <Section
      id="membres"
      title={t('membersTitle')}
      description={t('membersDescription')}
      className={SECTION}
      actions={
        canInvite ? (
          <Dialog onOpenChange={(open) => open && setSession((s) => s + 1)}>
            <DialogTrigger asChild>
              <Button variant="primary" icon={UserPlus}>
                {t('invite')}
              </Button>
            </DialogTrigger>
            <CreateInvitationContent key={session} />
          </Dialog>
        ) : undefined
      }
    >
      <GlassCard className="p-1.5">
        <ul aria-label={t('membersList')} className="grid grid-cols-[minmax(0,1fr)]">
          {active.map((m) => (
            <li key={m.id} className={ROW}>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium [overflow-wrap:anywhere] text-fg">{m.name}</p>
                <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">{m.email}</p>
                {canInvite && (
                  <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">
                    {placementOf(m)}
                  </p>
                )}
              </div>
              <Badge>
                {roleLabel(m.role, { owner: t('owner'), admin: t('admin'), member: t('member') })}
              </Badge>
              {canInvite && <EditPlacement member={m} />}
            </li>
          ))}
        </ul>
      </GlassCard>
      {former.length > 0 && (
        <>
          <h3 id="anciens-membres" className="mt-6 mb-2 text-label font-semibold text-fg">
            {t('formerMembersTitle')}
          </h3>
          <GlassCard className="p-1.5">
            <ul aria-labelledby="anciens-membres" className="grid grid-cols-[minmax(0,1fr)]">
              {former.map((m) => (
                <li key={m.id} className={ROW}>
                  <p className="min-w-0 flex-1 text-body [overflow-wrap:anywhere] text-muted">
                    {t('formerMember', { name: m.name })}
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}
    </Section>
  );
}

const step = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.enter, ease: ease.out },
};

type Created = { url: string; expiresAt: Date };

/**
 * Création d'un lien d'invitation, en deux étapes, comme celle d'un jeton (create-token.tsx) : à l'étape 2, le lien ne
 * doit pas se perdre, seul « Terminé » ferme. Montée avec une `key` neuve à chaque ouverture : le lien disparaît avec elle.
 */
function CreateInvitationContent() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <DialogContent
      size={created ? 'sm' : 'md'}
      hideClose
      dismissible={false}
      onEscapeKeyDown={(e) => created && e.preventDefault()}
      title={created ? t('inviteCreated') : t('inviteMember')}
      description={nb(created ? t('inviteCreatedDescription') : t('inviteDescription'))}
    >
      {created ? (
        <motion.div key="cree" className="grid gap-4" {...step}>
          <div className="grid gap-2.5">
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">
              {created.url}
            </code>
            <Notice tone="warning" live="status" className="py-2.5">
              {t('copyInvite')} {t('validUntil')} {formatDate(created.expiresAt, locale)}.
            </Notice>
          </div>
          <DialogFooter>
            <CopyButton value={created.url} size="md" autoFocus />
            <DialogClose asChild>
              <Button variant="primary">{t('done')}</Button>
            </DialogClose>
          </DialogFooter>
        </motion.div>
      ) : (
        <InviteForm
          onCreated={setCreated}
          secondaryAction={
            <DialogClose asChild>
              <Button variant="ghost">{t('cancel')}</Button>
            </DialogClose>
          }
        />
      )}
    </DialogContent>
  );
}

/** Le crayon d'une ligne et sa fenêtre : service, poste et niveau d'un membre. Pour un propriétaire ou un administrateur seulement. */
function EditPlacement({ member }: { member: MemberRow }) {
  const t = useTranslations('settings');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton
          icon={Pencil}
          label={t('editPlacement', { name: member.name })}
          tooltip={false}
        />
      </DialogTrigger>
      <DialogContent
        size="md"
        title={member.name}
        description={t('editPlacementDescription', { name: member.name })}
      >
        <EditPlacementForm member={member} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

// Dans le contenu de la fenêtre : il se démonte à la fermeture, donc chaque ouverture repart du poste enregistré.
function EditPlacementForm({ member, onSaved }: { member: MemberRow; onSaved: () => void }) {
  const t = useTranslations('settings');
  const form = usePlacementForm({
    department: member.department ?? '',
    job: member.job ?? '',
    seniority: member.seniority === null ? '' : String(member.seniority),
  });
  const [pending, startTransition] = useTransition();
  const formError = form.text('form');

  // Pas de `action={…}` : React remet le formulaire à zéro après une action, et les listes (Radix Select) avec lui.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await setMemberPlacementAction(member.id, form.placement);
        if ('errors' in result) form.reject(result.errors);
        else onSaved();
      } catch {
        form.reject({ form: 'form' });
      }
    });
  };

  return (
    <form ref={form.formRef} noValidate onSubmit={submit} className="grid gap-5">
      <PlacementFields {...form.fields} />
      {formError && (
        <Notice tone="error" live="alert">
          {formError}
        </Notice>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">{t('cancel')}</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={pending}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
