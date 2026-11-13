'use client';

import { Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useState } from 'react';
import { SendByEmail } from '@/components/verre/equipe/send-by-email';
import { Avatar } from '@/components/verre/ui/avatar';
import { Button } from '@/components/verre/ui/button';
import { CopyButton } from '@/components/verre/ui/copy';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/verre/ui/dialog';
import {
  departmentLabelKey,
  jobLabelKey,
  type OnboardingStepId,
  seniorityId,
} from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { Placement } from '@/server/auth/onboarding';
import { type CreatedInvitation, InviteForm } from './invite-form';
import { StaticThing } from './preview';
import { OnboardingSteps, SHEET } from './steps';

export type TeammatesStepProps = {
  steps: OnboardingStepId[];
  organizationName: string;
  /** Le propriétaire (ou l'administrateur) qui invite : sa place dans l'organigramme. */
  you: { name: string; placement: Placement };
};

// Une carte par collaborateur ; `created` n'existe que dans l'état du composant (le lien en clair n'est affiché qu'une fois),
// `copied` : son lien a été copié au moins une fois.
type Teammate = {
  id: number;
  created: CreatedInvitation | null;
  copied: boolean;
  /** Ce qui est saisi avant « Créer le lien » : l'équipe dessinée à droite le montre déjà. */
  draft?: { name: string; placement: Placement };
};

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

/**
 * L'étape Collaborateurs de l'onboarding : un lien d'invitation par personne, chacun avec son service, son poste et son
 * niveau, à copier ou à envoyer par e-mail. À droite (dessous sous 1024 px), l'équipe qui se remplit à mesure.
 */
export function TeammatesStep({ steps, organizationName, you }: TeammatesStepProps) {
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
    <div className="grid min-w-0 gap-6">
      <OnboardingSteps steps={steps} current="teammates" back={{ tools: '/bienvenue/outils' }} />
      <div className="grid gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        {/* gap-4 : à 1512 × 771, toute l'étape tient dans la fenêtre, « Entrer dans Leon » compris. */}
        <div className="grid min-w-0 content-start gap-4">
          <div>
            <h1 className="text-h1 font-semibold tracking-[-0.02em] text-fg">{tm('title')}</h1>
            <p className="mt-2 text-ui text-pretty text-muted">{nb(tm('lead'))}</p>
          </div>

          <ul className="grid gap-4">
            {teammates.map(({ id, created }) => (
              <li key={id} className={SHEET}>
                {created ? (
                  <div className="grid gap-4">
                    <div className="min-w-0">
                      <p className="text-title font-semibold text-fg [overflow-wrap:anywhere]">
                        {created.name || <NoName />}
                      </p>
                      <p className="text-label text-muted">
                        {describe(placementOf(created), true)}
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        <code className="min-w-0 flex-1 basis-56 rounded-item border border-line-strong bg-n-50 px-3 py-2 font-mono text-label leading-relaxed break-all text-fg select-all">
                          {created.url}
                        </code>
                        <CopyButton
                          value={created.url}
                          autoFocus
                          onCopied={() =>
                            setTeammates((list) =>
                              list.map((card) =>
                                card.id === id ? { ...card, copied: true } : card,
                              ),
                            )
                          }
                        />
                      </div>
                      <p className="text-label text-muted">{tm('linkNote')}</p>
                    </div>
                    <SendByEmail url={created.url} />
                  </div>
                ) : (
                  <InviteForm
                    onDraft={({ name, placement }) =>
                      setTeammates((list) =>
                        list.map((card) =>
                          card.id === id
                            ? {
                                ...card,
                                draft: {
                                  name,
                                  placement: {
                                    department: placement.department || null,
                                    job: placement.job || null,
                                    seniority: placement.seniority
                                      ? Number(placement.seniority)
                                      : null,
                                  },
                                },
                              }
                            : card,
                        ),
                      )
                    }
                    onCreated={(invitation) =>
                      setTeammates((list) =>
                        list.map((card) =>
                          card.id === id ? { ...card, created: invitation } : card,
                        ),
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ul>

          <div>
            <Button
              variant="quiet"
              icon={Plus}
              className="-ml-3"
              onClick={() =>
                setTeammates((list) => [...list, { id: list.length, created: null, copied: false }])
              }
            >
              {tm('addTeammate')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button asChild variant="primary" className="h-10" onClick={confirmLeave}>
              <Link href="/bienvenue/pret">{tm('enter')}</Link>
            </Button>
            <Button asChild variant="quiet" onClick={confirmLeave}>
              <Link href="/bienvenue/pret">{tm('skip')}</Link>
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
                  <Link href="/bienvenue/pret">{tm('leave')}</Link>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <section aria-label={tm('previewLabel')} className="grid min-w-0 content-start gap-3">
          <h2 className="text-title font-semibold [overflow-wrap:anywhere] text-fg">
            {organizationName}
          </h2>
          <StaticThing
            size="card"
            picture={<Avatar name={you.name} size={36} />}
            name={you.name}
            caption={[tm('you'), describe(you.placement)].filter(Boolean).join(' · ')}
          />
          <ul className="ob-tree">
            {teammates.map(({ id, created, draft }) => {
              const drafted = draft ? describe(draft.placement) : '';
              // Rien de saisi encore : une place vide, qui ne porte que son état (ni tiret ni point d'interrogation).
              const blank = !created && !draft?.name && drafted === '';
              return (
                <li key={id}>
                  <StaticThing
                    picture={
                      created || draft?.name ? (
                        <Avatar name={created?.name || draft?.name || ''} size={28} />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong text-icon"
                        >
                          <UserRound className="size-3.5" strokeWidth={1.8} />
                        </span>
                      )
                    }
                    name={
                      blank ? (
                        <span className="font-normal text-muted">{tm('draft')}</span>
                      ) : (
                        created?.name || draft?.name || <NoName />
                      )
                    }
                    caption={
                      created
                        ? [describe(placementOf(created)), tm('linkCreated')]
                            .filter(Boolean)
                            .join(' · ')
                        : blank
                          ? undefined
                          : drafted || tm('draft')
                    }
                    className={cn(!created && 'border-dashed bg-transparent shadow-none')}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
