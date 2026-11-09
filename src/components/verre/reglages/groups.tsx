'use client';

import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { deleteGroupAction, saveGroupAction } from '@/app/(app)/reglages/actions';
import {
  AlertDialog,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Section,
  toast,
} from '@/components/verre';
import { departmentLabelKey } from '@/lib/onboarding';
import type { Groupe } from '@/server/auth/groupes';
import { SECTION } from './reglages';

const ROW =
  'relative flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 rounded-field px-3 py-2.5 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line';

type Person = { id: string; name: string };

/**
 * Section « Groupes », pour un propriétaire ou un administrateur : chaque service est un groupe tout seul (ses membres
 * sont ceux du service) ; les groupes libres se créent, se renomment, se composent et se suppriment ici. Un document
 * partagé à un groupe n'est visible que de ses membres et de son auteur.
 */
export function GroupsSection({ groups, members }: { groups: Groupe[]; members: Person[] }) {
  const t = useTranslations('settings');
  const o = useTranslations('onboarding');
  const label = (g: Groupe) => g.nom ?? o(departmentLabelKey(g.service));
  const [pending, startTransition] = useTransition();
  const remove = (g: Groupe) =>
    startTransition(async () => {
      try {
        const { ok } = await deleteGroupAction(g.id);
        if (ok) toast.success(t('groupDeleted', { name: label(g) }));
        else toast.error(t('groupRefused'));
      } catch {
        toast.error(t('groupRefused'));
      }
    });

  return (
    <Section
      id="groupes"
      title={t('groupsTitle')}
      description={t('groupsDescription')}
      className={SECTION}
      actions={
        <GroupDialog
          members={members}
          trigger={
            <Button variant="primary" icon={Plus}>
              {t('groupNew')}
            </Button>
          }
        />
      }
    >
      {groups.length === 0 ? (
        <EmptyState icon={Users} title={t('groupsEmpty')} description={t('groupsEmptyHelp')} />
      ) : (
        <GlassCard className="p-1.5">
          <ul aria-label={t('groupsTitle')} className="grid grid-cols-[minmax(0,1fr)]">
            {groups.map((g) => (
              <li key={g.id} className={ROW}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-body font-medium [overflow-wrap:anywhere] text-fg">
                    {label(g)}
                  </p>
                  <p className="mt-0.5 text-label text-muted">
                    {g.service ? `${t('groupService')} · ` : ''}
                    {t('groupCount', { count: g.membres.length })}
                  </p>
                </div>
                {g.nom && (
                  <div className="flex items-center gap-2">
                    <GroupDialog
                      group={g}
                      members={members}
                      trigger={
                        <Button
                          size="sm"
                          variant="quiet"
                          aria-label={t('groupEditTitle', { name: label(g) })}
                        >
                          {t('groupEdit')}
                        </Button>
                      }
                    />
                    <AlertDialog
                      trigger={
                        <Button
                          size="sm"
                          variant="quiet"
                          loading={pending}
                          aria-label={t('groupDeleteNamed', { name: label(g) })}
                        >
                          {t('groupDelete')}
                        </Button>
                      }
                      title={t('groupDeleteTitle', { name: label(g) })}
                      description={t('groupDeleteDescription')}
                      confirmLabel={t('groupDelete')}
                      cancelLabel={t('cancel')}
                      onConfirm={() => remove(g)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </Section>
  );
}

// Créer (sans `group`) ou modifier un groupe libre : son nom et ses membres, enregistrés ensemble.
function GroupDialog({
  group,
  members,
  trigger,
}: {
  group?: Groupe;
  members: Person[];
  trigger: ReactNode;
}) {
  const t = useTranslations('settings');
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // À chaque ouverture, la fenêtre repart du groupe tel que la page le montre.
  const openChange = (next: boolean) => {
    if (next) {
      setNom(group?.nom ?? '');
      setChosen(group?.membres ?? []);
      setError(null);
    }
    setOpen(next);
  };
  const toggle = (id: string, on: boolean) =>
    setChosen((list) => (on ? [...list, id] : list.filter((m) => m !== id)));
  const save = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveGroupAction(group?.id ?? null, nom, chosen);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        toast.success(t('groupSaved'));
        setOpen(false);
      } catch {
        setError(t('groupRefused'));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="md"
        title={group ? t('groupEditTitle', { name: group.nom ?? '' }) : t('groupNew')}
      >
        <form onSubmit={save} className="grid gap-5">
          <Field label={t('groupName')} error={error ?? undefined}>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} required />
          </Field>
          <fieldset className="grid min-w-0 gap-2">
            <legend className="mb-2 text-label font-semibold text-fg-2">
              {t('groupMembersLegend')}
            </legend>
            <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">
              {members.map((m) => (
                <Checkbox
                  key={m.id}
                  label={m.name}
                  checked={chosen.includes(m.id)}
                  onCheckedChange={(on) => toggle(m.id, on)}
                />
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('cancel')}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
