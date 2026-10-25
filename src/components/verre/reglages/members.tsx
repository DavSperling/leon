'use client';

import { UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
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
const roleLabel = (role: string) =>
  role
    .split(',')
    .map((r) => ROLE_LABELS[r] ?? r)
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

  return (
    <Section
      id="membres"
      title="Membres"
      description="Chacun voit ce que Leon lit dans les outils de l’équipe. Les conversations avec les assistants, les boîtes mail, Google Drive et Slack restent à leur propriétaire."
      className={SECTION}
      actions={
        canInvite ? (
          <Dialog onOpenChange={(open) => open && setSession((s) => s + 1)}>
            <DialogTrigger asChild>
              <Button variant="primary" icon={UserPlus}>
                Inviter
              </Button>
            </DialogTrigger>
            <CreateInvitationContent key={session} />
          </Dialog>
        ) : undefined
      }
    >
      <GlassCard className="p-1.5">
        <ul aria-label="Membres de l’espace" className="grid grid-cols-[minmax(0,1fr)]">
          {members.map((m) => (
            <li
              key={m.id}
              className="relative flex min-h-[60px] items-center gap-4 rounded-field px-3 py-2.5 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium [overflow-wrap:anywhere] text-fg">{m.name}</p>
                <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">{m.email}</p>
              </div>
              <Badge>{roleLabel(m.role)}</Badge>
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
      title={url ? 'Lien créé' : 'Inviter un membre'}
      description={nb(
        url
          ? 'Envoyez-le vous-même à la personne à inviter : Leon n’envoie aucun e-mail.'
          : 'Le lien sert une seule fois, à créer un compte dans cet espace. Il expire au bout de 7 jours.',
      )}
    >
      {url && expiresAt ? (
        <motion.div key="cree" className="grid gap-4" {...step}>
          <div className="grid gap-2.5">
            <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 text-[13px] leading-[1.6] tracking-normal break-all text-fg select-all">
              {url}
            </code>
            <Notice tone="warning" live="status" className="py-2.5">
              Copiez-le maintenant : il ne sera plus affiché. Valable jusqu’au{' '}
              {formatDate(expiresAt)}.
            </Notice>
          </div>
          <DialogFooter>
            <CopyButton value={url} size="md" autoFocus />
            <DialogClose asChild>
              <Button variant="primary">Terminé</Button>
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
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? 'Envoi…' : 'Créer le lien'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
