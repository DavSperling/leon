'use client';

import { UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { createInvitationAction } from '@/app/(app)/reglages/actions';
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
  Notice,
  Section,
} from '@/components/verre';
import { duration, ease, formatDate, nb } from '@/lib/verre';
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
        <ul aria-label={t('membersTitle')} className="grid grid-cols-[minmax(0,1fr)]">
          {members.map((m) => (
            <li
              key={m.id}
              className="relative flex min-h-[60px] items-center gap-4 rounded-field px-3 py-2.5 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium [overflow-wrap:anywhere] text-fg">{m.name}</p>
                <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">{m.email}</p>
              </div>
              <Badge>
                {roleLabel(m.role, { owner: t('owner'), admin: t('admin'), member: t('member') })}
              </Badge>
            </li>
          ))}
        </ul>
      </GlassCard>
    </Section>
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
