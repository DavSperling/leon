'use client';

import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import { setManagerAction } from '@/app/(app)/reglages/actions';
import {
  Avatar,
  Button,
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  Thing,
  ThingGrid,
  toast,
} from '@/components/verre';
import { departmentLabelKey, jobLabelKey } from '@/lib/onboarding';
import { nb } from '@/lib/verre';
import type { DirectoryState } from '@/server/auth/annuaire';
import type { Groupe } from '@/server/auth/groupes';
import type { MemberRow, PendingInvitation } from '@/server/auth/members';
import type { Report } from '@/server/auth/organisation';
import { DirectoryPanel } from './directory-panel';
import { GroupPanel, GroupPicture } from './group-panel';
import { InvitePanel } from './invite-panel';
import { type ChartMember, OrgChart } from './org-chart';
import { type Activity, InvitationPanel, type Person, PersonPanel } from './person-panel';

const MANAGER_REFUSAL = {
  boucle: 'managerLoop',
  proprietaire: 'managerOwner',
  refuse: 'memberFailed',
} as const;

/**
 * L'équipe : l'organigramme (chacun une tuile, des traits fins ; à part ceux qui ne sont pas encore placés), puis tout le
 * monde, replié, puis les groupes. Une personne ouvre sa fiche (?personne=…). Qui peut inviter le fait d'ici : la
 * pastille « Inviter », ou le « + » sous une personne ; un invité paraît tout de suite dans l'arbre.
 */
export function Team({
  members,
  invitations,
  reports,
  activity,
  seeAllAllowed,
  admin,
  groups,
  directory,
  workspace,
  personne,
}: {
  members: MemberRow[];
  invitations: PendingInvitation[];
  reports: Report[];
  activity: Activity | null;
  seeAllAllowed: boolean;
  admin: boolean;
  groups: Groupe[];
  directory: DirectoryState | null;
  workspace: string;
  personne: string | null;
}) {
  const t = useTranslations('team');
  const s = useTranslations('settings');
  const o = useTranslations('onboarding');
  const router = useRouter();
  const jobOf = (p: Pick<Person, 'department' | 'job'>) =>
    p.job ? o(jobLabelKey(p.department, p.job)) : null;

  const invited: Person[] = invitations.map((inv) => ({
    id: inv.id,
    name: inv.name ?? jobOf(inv) ?? t('invitedSomeone'),
    email: '',
    role: 'member',
    former: false,
    department: inv.department,
    job: inv.job,
    seniority: inv.seniority,
    self: false,
    managerId: inv.managerId,
    invited: true,
    expiresAt: inv.expiresAt,
  }));
  const people: Person[] = [...members.map(({ userId: _, ...m }) => m), ...invited];
  const active = members.filter((m) => !m.former).map(({ id, name }) => ({ id, name }));
  const caption = (p: ChartMember | Person) =>
    p.self
      ? t('you')
      : p.invited
        ? t('invited')
        : 'former' in p && p.former
          ? t('former')
          : jobOf(p);

  // La fiche ouverte se lit dans l'adresse : un lien, un rechargement, la palette y mènent. Pour une personne sous le
  // lecteur, la page recharge aussi son activité (le serveur la lit) ; sinon l'adresse change sans aller-retour.
  const [openId, setOpenId] = useState<string | null>(personne);
  const openPerson = (id: string) => {
    setOpenId(id);
    const url = `/equipe?personne=${id}`;
    if (reports.some((r) => r.memberId === id)) router.replace(url, { scroll: false });
    else window.history.replaceState(null, '', url);
  };
  const closePerson = () => {
    setOpenId(null);
    window.history.replaceState(null, '', '/equipe');
  };
  const opened = people.find((p) => p.id === openId) ?? null;

  const [inviting, setInviting] = useState<{ managerId: string | null; session: number } | null>(
    null,
  );
  const invite = (managerId: string | null) =>
    setInviting((current) => ({ managerId, session: (current?.session ?? 0) + 1 }));

  const [movingId, setMovingId] = useState<string | null>(null);
  const [, startMove] = useTransition();
  const move = (memberId: string, managerId: string | null) =>
    startMove(async () => {
      setMovingId(memberId);
      try {
        const { result } = await setManagerAction(memberId, managerId);
        if (result !== 'ok') toast.error(nb(s(MANAGER_REFUSAL[result])));
      } catch {
        toast.error(s('memberFailed'));
      }
      setMovingId(null);
    });

  const [directoryOpen, setDirectoryOpen] = useState(
    Boolean(directory && (directory.plan || directory.error)),
  );
  const closeDirectory = (open: boolean) => {
    setDirectoryOpen(open);
    // l'aperçu ne se rouvre pas au rechargement
    if (!open && (directory?.plan || directory?.error))
      router.replace('/equipe', { scroll: false });
  };

  const [group, setGroup] = useState<{ group: Groupe | null; session: number } | null>(null);

  return (
    <div className="mx-auto max-w-[var(--page-max)]">
      <PageHeader
        title={t('title')}
        actions={
          admin ? (
            <Button variant="primary" onClick={() => invite(null)}>
              {t('invite')}
            </Button>
          ) : undefined
        }
      />

      <Section
        id="organigramme"
        title={t('chartTitle')}
        actions={
          admin && directory && directory.providers.length > 0 ? (
            <Button size="sm" onClick={() => setDirectoryOpen(true)}>
              {s('directoryTitle')}
            </Button>
          ) : undefined
        }
      >
        <OrgChart
          people={people.filter((p) => !p.former)}
          caption={caption}
          admin={admin}
          movingId={movingId}
          onOpen={openPerson}
          onAdd={invite}
          onMove={move}
        />
      </Section>

      <Everyone people={people} caption={caption} onOpen={openPerson} />

      {admin && (
        <Section
          id="groupes"
          title={t('groupsTitle')}
          actions={
            <Button
              size="sm"
              onClick={() => setGroup((g) => ({ group: null, session: (g?.session ?? 0) + 1 }))}
            >
              {s('groupNew')}
            </Button>
          }
        >
          {groups.length === 0 ? (
            <EmptyState title={s('groupsEmpty')} description={s('groupsEmptyHelp')} />
          ) : (
            <ThingGrid>
              {groups.map((g) => (
                <Thing
                  key={g.id}
                  picture={<GroupPicture />}
                  name={g.nom ?? o(departmentLabelKey(g.service))}
                  caption={g.service ? t('groupDepartment') : undefined}
                  onClick={() => setGroup((c) => ({ group: g, session: (c?.session ?? 0) + 1 }))}
                />
              ))}
            </ThingGrid>
          )}
        </Section>
      )}

      {opened &&
        (opened.invited ? (
          <InvitationPanel
            key={opened.id}
            person={opened}
            open
            onOpenChange={(open) => !open && closePerson()}
            people={people}
          />
        ) : (
          <PersonPanel
            key={opened.id}
            person={opened}
            open
            onOpenChange={(open) => !open && closePerson()}
            people={people}
            admin={admin}
            report={reports.find((r) => r.memberId === opened.id)}
            seeAllAllowed={seeAllAllowed}
            activity={activity}
          />
        ))}
      {inviting && (
        <InvitePanel
          key={inviting.session}
          open
          onOpenChange={(open) => !open && setInviting(null)}
          managerId={inviting.managerId}
          people={active}
          workspace={workspace}
        />
      )}
      {group && (
        <GroupPanel
          key={group.session}
          group={group.group}
          open
          onOpenChange={(open) => !open && setGroup(null)}
          members={active}
        />
      )}
      {directory && (
        <DirectoryPanel state={directory} open={directoryOpen} onOpenChange={closeDirectory} />
      )}
    </div>
  );
}

// Les visages montrés tant que « Tout le monde » est replié.
const FACES = 8;

// Tout le monde, replié d'abord : des tuiles et une recherche. Les anciens membres à la fin.
function Everyone({
  people,
  caption,
  onOpen,
}: {
  people: Person[];
  caption: (p: Person) => string | null;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('team');
  const o = useTranslations('onboarding');
  const locale = useLocale();
  const [shown, setShown] = useState(false);
  const [q, setQ] = useState('');
  // Le bouton qui ouvre disparaît avec le repli : le focus va à la recherche, puis revient au bouton.
  const showRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toggle = (next: boolean) => {
    flushSync(() => setShown(next));
    (next ? searchRef : showRef).current?.focus();
  };
  const words = q.trim().toLocaleLowerCase();
  const ordered = [...people].sort(
    // la langue de l'interface, pas celle de la machine : les visages sont rendus par le serveur puis par le navigateur
    (a, b) => Number(a.former) - Number(b.former) || a.name.localeCompare(b.name, locale),
  );
  const found = ordered.filter(
    (p) =>
      !words ||
      [p.name, p.email, p.job ? o(jobLabelKey(p.department, p.job)) : '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(words),
  );
  return (
    <Section
      id="tout-le-monde"
      title={t('everyone')}
      actions={
        shown && (
          <>
            <SearchField
              ref={searchRef}
              label={t('searchPeople')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button size="sm" variant="quiet" onClick={() => toggle(false)}>
              {t('hide')}
            </Button>
          </>
        )
      }
    >
      {/* repliée : les visages et « Voir tout le monde », sous le titre, là où l'œil est déjà */}
      {!shown && (
        <button
          ref={showRef}
          type="button"
          aria-expanded={false}
          onClick={() => toggle(true)}
          className="group flex items-center gap-3 rounded-full py-1 pr-3 text-ui font-medium whitespace-nowrap text-fg-2 hover:text-fg"
        >
          {/* sur un téléphone, cinq visages : la ligne tient avec ses mots */}
          <span className="flex gap-1 max-sm:[&>:nth-child(n+6)]:hidden">
            {ordered.slice(0, FACES).map((p) => (
              <Avatar key={p.id} name={p.name} size={28} />
            ))}
          </span>
          {t('showEveryone')}
          <ChevronDown aria-hidden="true" className="size-4 text-muted group-hover:text-fg" />
        </button>
      )}
      {shown && (
        <div id="tout-le-monde-liste">
          {found.length === 0 ? (
            <EmptyState
              title={t('nobodyMatches', { q: q.trim() })}
              action={
                <Button size="sm" onClick={() => setQ('')}>
                  {t('clearSearch')}
                </Button>
              }
            />
          ) : (
            <ThingGrid>
              {found.map((p) => (
                <Thing
                  key={p.id}
                  picture={<Avatar name={p.name} size={28} />}
                  name={p.name}
                  caption={caption(p)}
                  title={[p.name, caption(p)].filter(Boolean).join(' · ')}
                  onClick={() => onOpen(p.id)}
                />
              ))}
            </ThingGrid>
          )}
        </div>
      )}
    </Section>
  );
}
