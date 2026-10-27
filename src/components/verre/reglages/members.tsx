'use client';

import { UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  createInvitationAction,
  removeMemberAction,
  setManagerAction,
  setMemberRoleAction,
} from '@/app/(app)/reglages/actions';
import {
  AlertDialog,
  Badge,
  Button,
  CopyButton,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  GlassCard,
  Notice,
  Section,
  Select,
  toast,
} from '@/components/verre';
import { cn, duration, ease, formatDate, nb } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';
import { SECTION } from './reglages';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  member: 'Membre',
};
// Better Auth peut ranger plusieurs rôles séparés par des virgules.
const roleLabel = (role: string, labels: Record<string, string>) =>
  role
    .split(',')
    .map((r) => labels[r] ?? ROLE_LABELS[r] ?? r)
    .join(', ');

/**
 * Section « Membres » : qui est dans l'espace et à qui chacun est rattaché. Un propriétaire ou un administrateur invite,
 * choisit le manager de chacun, change un rôle et retire un membre (jamais un propriétaire, ni lui-même).
 */
export function MembersSection({
  members,
  canInvite,
  viewerId,
}: {
  members: MemberRow[];
  canInvite: boolean;
  viewerId: string;
}) {
  const [session, setSession] = useState(0);
  const t = useTranslations('settings');

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
          {members.map((m) => (
            <MemberItem
              key={m.id}
              member={m}
              members={members}
              manage={canInvite}
              self={m.userId === viewerId}
            />
          ))}
        </ul>
      </GlassCard>
    </Section>
  );
}

const NO_MANAGER = 'aucun';

function MemberItem({
  member: m,
  members,
  manage,
  self,
}: {
  member: MemberRow;
  members: MemberRow[];
  manage: boolean;
  self: boolean;
}) {
  const t = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const roles = m.role.split(',');
  const owner = roles.includes('owner');
  const manager = members.find((other) => other.id === m.managerId);
  const badge = (
    <Badge>
      {roleLabel(m.role, { owner: t('owner'), admin: t('admin'), member: t('member') })}
    </Badge>
  );

  // `work` rend le message de réussite, ou d'échec.
  const run = (work: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      try {
        const { ok, message } = await work();
        if (ok) toast.success(message);
        else toast.error(message);
      } catch {
        toast.error(t('memberFailed'));
      }
    });
  const changeManager = (value: string) =>
    run(async () => {
      const { result } = await setManagerAction(m.id, value === NO_MANAGER ? null : value);
      if (result === 'ok') return { ok: true, message: t('managerSaved') };
      return { ok: false, message: result === 'boucle' ? t('managerLoop') : t('memberFailed') };
    });
  const changeRole = (role: string) =>
    run(async () => {
      const { ok } = await setMemberRoleAction(m.id, role);
      return { ok, message: ok ? t('roleSaved') : t('memberFailed') };
    });
  const remove = () =>
    run(async () => {
      const { ok } = await removeMemberAction(m.id);
      return { ok, message: ok ? t('memberRemoved', { name: m.name }) : t('memberFailed') };
    });

  return (
    <li
      className={cn(
        'relative flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-3 rounded-field px-3 py-3 transition-opacity duration-300 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line',
        pending && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1 basis-52">
        <p className="text-body font-medium [overflow-wrap:anywhere] text-fg">{m.name}</p>
        <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">{m.email}</p>
        {manager && !manage && (
          <p className="mt-0.5 text-label text-muted">{t('reportsTo', { name: manager.name })}</p>
        )}
      </div>
      {manage ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('manager')} className="w-44">
            <Select
              aria-label={t('managerOf', { name: m.name })}
              value={m.managerId ?? NO_MANAGER}
              onValueChange={changeManager}
              disabled={pending}
              options={[
                { value: NO_MANAGER, label: t('noManager') },
                ...members
                  .filter((other) => other.id !== m.id)
                  .map((other) => ({ value: other.id, label: other.name })),
              ]}
            />
          </Field>
          {owner || self ? (
            <div className="flex h-10 items-center">{badge}</div>
          ) : (
            <>
              <Field label={t('role')} className="w-40">
                <Select
                  aria-label={t('roleOf', { name: m.name })}
                  value={roles.includes('admin') ? 'admin' : 'member'}
                  onValueChange={changeRole}
                  disabled={pending}
                  options={[
                    { value: 'member', label: t('member') },
                    { value: 'admin', label: t('admin') },
                  ]}
                />
              </Field>
              <AlertDialog
                trigger={
                  <Button size="lg" variant="quiet" loading={pending}>
                    {t('remove')}
                  </Button>
                }
                title={t('removeNamed', { name: m.name })}
                description={t('removeDescription')}
                confirmLabel={t('remove')}
                cancelLabel={t('cancel')}
                onConfirm={remove}
              />
            </>
          )}
        </div>
      ) : (
        badge
      )}
    </li>
  );
}

const step = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.enter, ease: ease.out },
};

type State = { error?: string; url?: string; expiresAt?: Date };

/**
 * Création d'un lien d'invitation, en deux étapes, comme celle d'un jeton (create-token.tsx) : à l'étape 2, le lien ne
 * doit pas se perdre, seul « Terminé » ferme. Montée avec une `key` neuve à chaque ouverture : le lien disparaît avec elle.
 */
function CreateInvitationContent() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(async (): Promise<State> => {
    const result = await createInvitationAction();
    return 'error' in result ? { error: result.error } : result;
  }, {});
  const { url, expiresAt } = state;

  return (
    <DialogContent
      size="sm"
      hideClose
      dismissible={false}
      onEscapeKeyDown={(e) => url && e.preventDefault()}
      title={url ? t('inviteCreated') : t('inviteMember')}
      description={nb(url ? t('inviteCreatedDescription') : t('inviteDescription'))}
    >
      {url && expiresAt ? (
        <motion.div key="cree" className="grid gap-4" {...step}>
          <div className="grid gap-2.5">
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">
              {url}
            </code>
            <Notice tone="warning" live="status" className="py-2.5">
              {t('copyInvite')} {t('validUntil')} {formatDate(expiresAt, locale)}.
            </Notice>
          </div>
          <DialogFooter>
            <CopyButton value={url} size="md" autoFocus />
            <DialogClose asChild>
              <Button variant="primary">{t('done')}</Button>
            </DialogClose>
          </DialogFooter>
        </motion.div>
      ) : (
        <form noValidate action={formAction} className="grid gap-5">
          {state.error && (
            <Notice tone="error" live="alert">
              {state.error}
            </Notice>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('cancel')}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? t('sending') : t('createInvite')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
