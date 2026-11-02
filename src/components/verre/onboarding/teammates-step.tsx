'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { initialOf } from '@/components/verre/shell/brand';
import { Badge } from '@/components/verre/ui/badge';
import { Button } from '@/components/verre/ui/button';
import { CopyButton } from '@/components/verre/ui/copy';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/verre/ui/dialog';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { departmentLabelKey, jobLabelKey, seniorityId } from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { Placement } from '@/server/auth/onboarding';
import { type CreatedInvitation, InviteForm } from './invite-form';

export type TeammatesStepProps = {
  organizationName: string;
  /** Le propriétaire (ou l'administrateur) qui invite : sa place dans l'organigramme. */
  you: { name: string; placement: Placement };
};

// Une carte par collaborateur ; `created` n'existe que dans l'état du composant (le lien en clair n'est affiché qu'une fois),
// `copied` : son lien a été copié au moins une fois.
type Teammate = { id: number; created: CreatedInvitation | null; copied: boolean };

// Une carte sans nom : le tiret est muet, un lecteur d'écran lit « Sans nom ».
function NoName() {
  const tm = useTranslations('onboarding.teammates');
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{tm('noName')}</span>
    </>
  );
}

function Node({
  initial,
  name,
  detail,
  badge,
  sub,
  dim,
}: {
  initial: string;
  name: string;
  detail: string;
  badge: ReactNode;
  sub?: boolean;
  dim?: boolean;
}) {
  return (
    <li className={cn('min-w-0', sub && 'ml-3 border-l border-line pl-3 sm:ml-5 sm:pl-4')}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-field border border-accent-line bg-accent-soft font-bold text-accent',
            dim && 'opacity-45',
          )}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p title={name || undefined} className="truncate text-ui font-semibold text-fg">
            {name || <NoName />}
          </p>
          {detail && (
            <p className="line-clamp-2 text-label text-muted [overflow-wrap:anywhere]">{detail}</p>
          )}
        </div>
        {badge}
      </div>
    </li>
  );
}

/**
 * L'étape Collaborateurs de l'onboarding : un lien d'invitation par personne, chacun avec son service, son poste et son
 * niveau. À droite (dessous en dessous de 1024 px), l'organigramme qui se remplit à mesure.
 */
export function TeammatesStep({ organizationName, you }: TeammatesStepProps) {
  const t = useTranslations('onboarding');
  const tm = useTranslations('onboarding.teammates');
  const [teammates, setTeammates] = useState<Teammate[]>([{ id: 0, created: null, copied: false }]);
  const [leaving, setLeaving] = useState(false);
  const uncopied = teammates.filter((card) => card.created && !card.copied).length;
  // Un lien jamais copié est perdu en partant : on demande d'abord.
  const confirmLeave = (event: MouseEvent) => {
    if (uncopied === 0) return;
    event.preventDefault();
    setLeaving(true);
  };

  // « poste · niveau » puis, selon `withDepartment`, « · service » : ce que la personne a de renseigné.
  const describe = (placement: Placement, withDepartment = false) => {
    const level = seniorityId(placement.seniority);
    return [
      placement.job && t(jobLabelKey(placement.department, placement.job)),
      level && t(`seniority.${level}`),
      withDepartment && placement.department && t(departmentLabelKey(placement.department)),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const placementOf = ({ placement }: CreatedInvitation): Placement => ({
    ...placement,
    seniority: Number(placement.seniority),
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid min-w-0 content-start gap-5">
        <div>
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{tm('title')}</h1>
          <p className="mt-2 text-body text-muted">{nb(tm('lead'))}</p>
        </div>

        <ul className="grid gap-4">
          {teammates.map(({ id, created }) => (
            <li key={id}>
              <GlassCard className="p-4 sm:p-5">
                {created ? (
                  <div className="grid gap-3">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-fg [overflow-wrap:anywhere]">
                        {created.name || <NoName />}
                      </p>
                      <p className="text-label text-muted">
                        {describe(placementOf(created), true)}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-start gap-2">
                      <code className="min-w-0 flex-1 basis-56 rounded-field border border-line-strong bg-glass-3 px-3 py-2 text-[12.5px] leading-relaxed break-all text-fg-2 select-all">
                        {created.url}
                      </code>
                      <CopyButton
                        value={created.url}
                        autoFocus
                        onCopied={() =>
                          setTeammates((list) =>
                            list.map((card) => (card.id === id ? { ...card, copied: true } : card)),
                          )
                        }
                      />
                    </div>
                    <p className="text-label text-muted">{tm('linkNote')}</p>
                  </div>
                ) : (
                  <InviteForm
                    onCreated={(invitation) =>
                      setTeammates((list) =>
                        list.map((card) =>
                          card.id === id ? { ...card, created: invitation } : card,
                        ),
                      )
                    }
                  />
                )}
              </GlassCard>
            </li>
          ))}
        </ul>

        <div>
          <Button
            variant="quiet"
            icon={Plus}
            onClick={() =>
              setTeammates((list) => [...list, { id: list.length, created: null, copied: false }])
            }
          >
            {tm('addTeammate')}
          </Button>
        </div>

        <div className="grid justify-items-center gap-3">
          <Button asChild variant="primary" size="lg" className="w-full" onClick={confirmLeave}>
            <Link href="/">{tm('enter')}</Link>
          </Button>
          <Button asChild variant="link" size="sm" onClick={confirmLeave}>
            <Link href="/">{tm('skip')}</Link>
          </Button>
        </div>

        <Dialog open={leaving} onOpenChange={setLeaving}>
          <DialogContent
            size="sm"
            title={tm('leaveTitle', { count: uncopied })}
            description={tm('leaveDescription')}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="primary">{tm('stay')}</Button>
              </DialogClose>
              <Button asChild variant="ghost">
                <Link href="/">{tm('leave')}</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section
        aria-label={tm('previewLabel')}
        className="grid min-w-0 content-center gap-4 rounded-box border border-line bg-glass p-4 sm:p-6"
      >
        <GlassCard className="p-4">
          <h2 className="mb-3 text-meta font-medium tracking-[0.05em] text-muted uppercase [overflow-wrap:anywhere]">
            {organizationName}
          </h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <Node
              initial={initialOf(you.name)}
              name={you.name}
              detail={describe(you.placement)}
              badge={<Badge>{tm('you')}</Badge>}
            />
            {teammates.map(({ id, created }) => (
              <Node
                key={id}
                sub
                dim={!created}
                initial={(created && initialOf(created.name)) || '?'}
                name={created?.name ?? ''}
                detail={created ? describe(placementOf(created)) : ''}
                badge={
                  created ? (
                    <Badge tone="accent">{tm('linkCreated')}</Badge>
                  ) : (
                    <Badge>{tm('draft')}</Badge>
                  )
                }
              />
            ))}
          </ul>
        </GlassCard>
      </section>
    </div>
  );
}
