'use client';

import { Check, Search } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useOptimistic, useState, useTransition } from 'react';
import {
  cancelInvitationAction,
  setFollowedAction,
  setSeeAllAction,
} from '@/app/(app)/equipe/actions';
import {
  removeMemberAction,
  setManagerAction,
  setMemberPlacementAction,
  setMemberRoleAction,
} from '@/app/(app)/reglages/actions';
import { NATURE_LABELS } from '@/components/search/view-model';
import {
  Avatar,
  Button,
  EmptyState,
  Fact,
  Facts,
  Notice,
  PanelClose,
  Pill,
  Reading,
  Select,
  SidePanel,
  Switch,
  Thing,
  ToolLogo,
  toast,
} from '@/components/verre';
import { PlacementFields, usePlacementForm } from '@/components/verre/onboarding/placement-fields';
import { roleLabel } from '@/components/verre/reglages/profile';
import { NATURE_LABELS_EN } from '@/lib/labels';
import { departmentLabelKey, jobLabelKey, seniorityId } from '@/lib/onboarding';
import { FOLLOW_FAMILIES, type FollowFamily } from '@/lib/providers';
import { cn, formatDate, nb } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';
import type { Report } from '@/server/auth/organisation';
import type { SourceHit } from '@/server/search/types';
import { ReportsTo } from './reports-to';

/** Une personne de l'écran : un membre, ou un lien d'invitation pas encore servi (`invited`). */
export type Person = Omit<MemberRow, 'userId'> & { invited?: boolean; expiresAt?: Date };
export type Activity = { forId: string; hits: SourceHit[] };

const MANAGER_REFUSAL = {
  boucle: 'managerLoop',
  proprietaire: 'managerOwner',
  refuse: 'memberFailed',
} as const;

/**
 * La fiche d'une personne : son adresse, son rôle, à qui elle est rattachée, son poste, son équipe ; pour qui peut
 * inviter, de quoi les changer et la retirer de l'espace. Pour une personne sous le lecteur, ce qu'il en suit, son
 * privé (si l'organisation le permet) et son activité récente : l'ancien « Mon équipe ».
 */
export function PersonPanel({
  person,
  open,
  onOpenChange,
  people,
  admin,
  report,
  seeAllAllowed,
  activity,
}: {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  admin: boolean;
  report: Report | undefined;
  seeAllAllowed: boolean;
  activity: Activity | null;
}) {
  const t = useTranslations('team');
  const s = useTranslations('settings');
  const o = useTranslations('onboarding');
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, startRemove] = useTransition();
  const [managerError, setManagerError] = useState<string | null>(null);
  const [savingManager, startManager] = useTransition();
  const [manager, setManager] = useOptimistic(person.managerId);
  const [savingRole, startRole] = useTransition();
  const roles = person.role.split(',');
  const owner = roles.includes('owner');
  const [role, setRole] = useOptimistic(roles.includes('admin') ? 'admin' : 'member');

  const job = person.job ? o(jobLabelKey(person.department, person.job)) : null;
  const level = seniorityId(person.seniority);
  const placement = [
    job,
    level && o(`seniority.${level}`),
    person.department && o(departmentLabelKey(person.department)),
  ]
    .filter(Boolean)
    .join(' · ');
  const active = people.filter((p) => !p.former && !p.invited);
  const managerName = people.find((p) => p.id === person.managerId)?.name;
  const team = active.filter((p) => p.managerId === person.id);
  const mayChangeRole = admin && !owner && !person.self && !person.former;
  const mayRemove = mayChangeRole;
  const mayMove = admin && !person.former;

  const changeManager = (next: string | null) =>
    startManager(async () => {
      setManagerError(null);
      setManager(next);
      try {
        const { result } = await setManagerAction(person.id, next);
        if (result !== 'ok') setManagerError(s(MANAGER_REFUSAL[result]));
      } catch {
        setManagerError(s('memberFailed'));
      }
    });
  const changeRole = (next: string) =>
    startRole(async () => {
      setRole(next);
      try {
        const { ok } = await setMemberRoleAction(person.id, next);
        if (!ok) toast.error(s('memberFailed'));
      } catch {
        toast.error(s('memberFailed'));
      }
    });
  const remove = () =>
    startRemove(async () => {
      try {
        const { ok } = await removeMemberAction(person.id);
        if (ok) {
          toast(s('memberRemoved', { name: person.name }));
          onOpenChange(false);
        } else toast.error(s('memberFailed'));
      } catch {
        toast.error(s('memberFailed'));
      }
      setAsking(false);
    });

  const sub = person.former
    ? t('former')
    : [job, person.self && t('you')].filter(Boolean).join(' · ');
  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAsking(false);
          setEditing(false);
        }
        onOpenChange(next);
      }}
      picture={<Avatar name={person.name} size={44} />}
      title={person.name}
      sub={sub || undefined}
      confirm={
        asking
          ? {
              title: s('removeNamed', { name: person.name }),
              text: s('removeDescription'),
              yes: t('remove'),
              no: t('keep'),
              busy: removing,
              busyLabel: t('removing'),
              onYes: remove,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        <>
          {mayRemove && (
            <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
              {t('remove')}
            </Button>
          )}
          <PanelClose asChild>
            <Button className="ml-auto">{s('done')}</Button>
          </PanelClose>
        </>
      }
    >
      <Facts>
        {!person.former && <Fact label={t('email')}>{person.email}</Fact>}
        <Fact label={t('role')}>
          {mayChangeRole ? (
            <Select
              aria-label={s('roleOf', { name: person.name })}
              value={role}
              onValueChange={changeRole}
              disabled={savingRole}
              options={[
                { value: 'member', label: s('member') },
                { value: 'admin', label: s('admin') },
              ]}
            />
          ) : (
            roleLabel(person.role, { owner: s('owner'), admin: s('admin'), member: s('member') })
          )}
        </Fact>
        {!person.former && (
          <Fact label={t('reportsToLabel')}>
            {mayMove ? (
              <>
                <ReportsTo
                  label={t('reportsToLabel')}
                  value={manager}
                  people={active.filter((p) => p.id !== person.id)}
                  onChange={changeManager}
                  busy={savingManager}
                  invalid={managerError !== null}
                  describedBy={managerError ? 'rattache-erreur' : undefined}
                />
                {managerError && (
                  <small
                    id="rattache-erreur"
                    role="alert"
                    className="!text-destructive font-medium"
                  >
                    {nb(managerError)}
                  </small>
                )}
              </>
            ) : (
              (managerName ?? t('nobody'))
            )}
          </Fact>
        )}
        {admin && !person.former && !editing && (
          <Fact label={t('position')}>
            <span className="flex items-start justify-between gap-3">
              <span className={cn(!placement && 'text-muted')}>
                {placement || t('positionNotSet')}
              </span>
              <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>
                {t('edit')}
              </Button>
            </span>
          </Fact>
        )}
        {team.length > 0 && (
          <Fact label={t('theirTeam')}>{team.map((p) => p.name).join(', ')}</Fact>
        )}
      </Facts>
      {editing && <PlacementForm person={person} onDone={() => setEditing(false)} />}
      {report && (
        <ManagerTools
          key={report.memberId}
          report={report}
          seeAllAllowed={seeAllAllowed}
          activity={activity?.forId === report.memberId ? activity : null}
        />
      )}
    </SidePanel>
  );
}

// Service, poste et niveau d'un membre, les trois ensemble (l'action refuse un poste incomplet).
function PlacementForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const t = useTranslations('team');
  const form = usePlacementForm({
    department: person.department ?? '',
    job: person.job ?? '',
    seniority: person.seniority === null ? '' : String(person.seniority),
  });
  const [pending, startTransition] = useTransition();
  const { department, job, seniority } = form.placement;
  const ready = Boolean(department && job && seniority);
  const formError = form.text('form');
  // Pas de `action={…}` : React remet le formulaire à zéro après une action, et les listes (Radix Select) avec lui.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      try {
        const result = await setMemberPlacementAction(person.id, form.placement);
        if ('errors' in result) form.reject(result.errors);
        else onDone();
      } catch {
        form.reject({ form: 'form' });
      }
    });
  };
  return (
    <form ref={form.formRef} noValidate onSubmit={submit} className="grid gap-4">
      <PlacementFields {...form.fields} />
      {formError && (
        <Notice tone="error" live="alert">
          {formError}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={pending} loadingLabel={t('saving')} disabled={!ready}>
          {t('save')}
        </Button>
        <Button variant="quiet" disabled={pending} onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

// Ce que le lecteur suit d'une personne sous lui, son privé, son activité récente.
function ManagerTools({
  report,
  seeAllAllowed,
  activity,
}: {
  report: Report;
  seeAllAllowed: boolean;
  activity: Activity | null;
}) {
  const t = useTranslations('team');
  const c = useTranslations('common');
  const family = useTranslations('connections.family');
  const [families, setFamilies] = useOptimistic(report.families);
  const [seeAll, setSeeAll] = useOptimistic(report.voitTout);
  const [saving, startTransition] = useTransition();

  const toggleSeeAll = (on: boolean) =>
    startTransition(async () => {
      setSeeAll(on);
      try {
        const { ok } = await setSeeAllAction(report.memberId, on);
        if (!ok) toast.error(t('followFailed'));
      } catch {
        toast.error(t('followFailed'));
      }
    });
  const toggle = (picked: FollowFamily) =>
    startTransition(async () => {
      const next = families.includes(picked)
        ? families.filter((f) => f !== picked)
        : FOLLOW_FAMILIES.filter((f) => f === picked || families.includes(f));
      setFamilies(next);
      try {
        const { ok } = await setFollowedAction(report.memberId, next);
        if (!ok) toast.error(t('followFailed'));
      } catch {
        toast.error(t('followFailed'));
      }
    });

  return (
    <div className="mt-6 grid gap-6 border-t border-line pt-6">
      {seeAllAllowed && (
        <div className="grid gap-1.5">
          <Switch
            label={t('seeAll')}
            checked={seeAll}
            onCheckedChange={toggleSeeAll}
            aria-describedby="voir-tout-aide"
          />
          {/* une phrase que la loi demande : qui lit quoi */}
          <p id="voir-tout-aide" className="text-label text-muted">
            {nb(t('seeAllHelp', { name: report.name }))}
          </p>
        </div>
      )}
      <fieldset className="grid min-w-0 gap-2.5">
        <legend className="mb-2.5 text-ui font-semibold text-fg">{t('following')}</legend>
        <div className="flex flex-wrap gap-2">
          {FOLLOW_FAMILIES.map((f) => {
            const on = families.includes(f);
            return (
              // Un état, pas une action : contour et coche, l'encre reste à la seule pastille de la vue.
              <Pill
                key={f}
                aria-pressed={on}
                icon={on ? Check : undefined}
                onClick={() => toggle(f)}
                className="aria-pressed:border-fg aria-pressed:bg-sheet aria-pressed:text-fg aria-pressed:[&_svg]:text-fg"
              >
                {f === 'documents' ? t('documents') : family(f)}
              </Pill>
            );
          })}
        </div>
      </fieldset>
      <section
        aria-labelledby="activite"
        aria-busy={saving}
        className={cn('grid gap-3 transition-opacity', saving && 'opacity-60')}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="activite" className="text-ui font-semibold text-fg">
            {t('activity')}
          </h3>
          <Link
            href={`/?q=${encodeURIComponent(`de:${report.email}`)}`}
            className="inline-flex items-center gap-1.5 text-label font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
          >
            <Search aria-hidden="true" strokeWidth={1.7} className="size-[13px]" />
            {t('searchAll', { name: report.name })}
          </Link>
        </div>
        {families.length === 0 ? (
          <EmptyState title={t('nothingFollowed')} description={t('nothingFollowedHelp')} />
        ) : activity === null ? (
          // à la taille du panneau (14 px) : en 18 px, le trait ambre y faisait un bloc
          <Reading className="text-ui">{c('loading')}</Reading>
        ) : activity.hits.length === 0 ? (
          <EmptyState title={t('nothingRecent')} description={t('nothingRecentHelp')} />
        ) : (
          <ul className="grid gap-2">
            {activity.hits.map((hit) => (
              <li key={hit.sourceId}>
                <ActivityItem hit={hit} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActivityItem({ hit }: { hit: SourceHit }) {
  const t = useTranslations('team');
  const locale = useLocale();
  const nature = locale === 'en' ? NATURE_LABELS_EN[hit.nature] : NATURE_LABELS[hit.nature];
  const props = {
    picture: <ToolLogo kind={hit.kind} size={28} />,
    name: hit.title?.trim() || t('untitled'),
    caption: nature,
    className: 'w-full',
  };
  return hit.url ? (
    <Thing {...props} href={hit.url} target="_blank" rel="noopener noreferrer" />
  ) : (
    <Thing {...props} chevron={false} disabled />
  );
}

/** La fiche d'une invitation pas encore servie : ce que le lien porte, et de quoi l'annuler. */
export function InvitationPanel({
  person,
  open,
  onOpenChange,
  people,
}: {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
}) {
  const t = useTranslations('team');
  const s = useTranslations('settings');
  const o = useTranslations('onboarding');
  const locale = useLocale();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const level = seniorityId(person.seniority);
  const managerName = people.find((p) => p.id === person.managerId)?.name;
  const cancel = () =>
    startTransition(async () => {
      try {
        const { ok } = await cancelInvitationAction(person.id);
        if (ok) onOpenChange(false);
        else toast.error(t('cancelFailed'));
      } catch {
        toast.error(t('cancelFailed'));
      }
      setAsking(false);
    });
  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) setAsking(false);
        onOpenChange(next);
      }}
      picture={<Avatar name={person.name} size={44} />}
      title={person.name}
      sub={t('invited')}
      confirm={
        asking
          ? {
              title: t('cancelInvitationQ'),
              text: t('cancelInvitationText'),
              yes: t('cancelInvitation'),
              no: t('keep'),
              busy: pending,
              busyLabel: t('cancelling'),
              onYes: cancel,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        <>
          <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
            {t('cancelInvitation')}
          </Button>
          <PanelClose asChild>
            <Button className="ml-auto">{s('done')}</Button>
          </PanelClose>
        </>
      }
    >
      <Facts>
        {person.department && (
          <Fact label={o('department')}>{o(departmentLabelKey(person.department))}</Fact>
        )}
        {person.job && (
          <Fact label={o('job')}>{o(jobLabelKey(person.department, person.job))}</Fact>
        )}
        {level && <Fact label={o('seniorityLabel')}>{o(`seniority.${level}`)}</Fact>}
        <Fact label={t('reportsToLabel')}>{managerName ?? t('nobody')}</Fact>
        {person.expiresAt && (
          <Fact label={t('expires')}>{formatDate(person.expiresAt, locale)}</Fact>
        )}
      </Facts>
    </SidePanel>
  );
}
