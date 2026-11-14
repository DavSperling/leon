'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { deleteGroupAction, saveGroupAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  Checkbox,
  Fact,
  Facts,
  Field,
  Input,
  PanelClose,
  SidePanel,
  toast,
} from '@/components/verre';
import { departmentLabelKey } from '@/lib/onboarding';
import { cn } from '@/lib/verre';
import type { Groupe } from '@/server/auth/groupes';

type Member = { id: string; name: string };

/** L'image d'un groupe : un rond calme, l'icône des gens. */
export function GroupPicture({ size = 28 }: { size?: 28 | 44 }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-n-50 text-icon',
        size === 44 ? 'size-11' : 'size-7',
      )}
    >
      <Users strokeWidth={1.6} className={size === 44 ? 'size-5' : 'size-4'} />
    </span>
  );
}

/**
 * Un groupe : un service est un groupe tout seul (ses membres sont ceux du service, il se lit seulement) ; un groupe
 * libre se nomme, se compose et se supprime ici. `group` nul : un nouveau groupe.
 */
export function GroupPanel({
  group,
  open,
  onOpenChange,
  members,
}: {
  group: Groupe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}) {
  const t = useTranslations('team');
  const s = useTranslations('settings');
  const o = useTranslations('onboarding');
  const label = group ? (group.nom ?? o(departmentLabelKey(group.service))) : s('groupNew');
  const [nom, setNom] = useState(group?.nom ?? '');
  const [chosen, setChosen] = useState<string[]>(group?.membres ?? []);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveGroupAction(group?.id ?? null, nom, chosen);
        if ('error' in result) setError(result.error);
        else {
          toast(s('groupSaved'));
          onOpenChange(false);
        }
      } catch {
        setError(s('groupRefused'));
      }
    });
  };
  const remove = () =>
    startTransition(async () => {
      try {
        const { ok } = await deleteGroupAction(group?.id ?? '');
        if (ok) {
          toast(s('groupDeleted', { name: label }));
          onOpenChange(false);
        } else toast.error(s('groupRefused'));
      } catch {
        toast.error(s('groupRefused'));
      }
      setAsking(false);
    });

  // Un groupe de service se lit seulement : le service de chacun le compose.
  if (group?.service)
    return (
      <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        picture={<GroupPicture size={44} />}
        title={label}
        sub={t('groupDepartment')}
      >
        <Facts>
          <Fact label={t('groupMembers')}>
            {members
              .filter((m) => group.membres.includes(m.id))
              .map((m) => m.name)
              .join(', ') || '—'}
          </Fact>
        </Facts>
      </SidePanel>
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) setAsking(false);
        onOpenChange(next);
      }}
      picture={<GroupPicture size={44} />}
      title={label}
      confirm={
        asking
          ? {
              title: s('groupDeleteTitle', { name: label }),
              text: s('groupDeleteDescription'),
              yes: s('groupDelete'),
              no: t('keep'),
              busy: pending,
              onYes: remove,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        <>
          {group && (
            <Button
              variant="quiet"
              className="-ml-4"
              disabled={pending}
              onClick={() => setAsking(true)}
            >
              {s('groupDelete')}
            </Button>
          )}
          <PanelClose asChild>
            <Button variant="quiet" className="ml-auto">
              {t('cancel')}
            </Button>
          </PanelClose>
          <Button
            type="submit"
            form="groupe"
            variant="primary"
            loading={pending}
            loadingLabel={t('saving')}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="groupe" noValidate onSubmit={save} className="grid gap-5">
        <Field label={s('groupName')} error={error ?? undefined}>
          <Input
            value={nom}
            maxLength={80}
            onChange={(e) => {
              setNom(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-label font-medium text-fg">{t('groupMembers')}</legend>
          <div className="grid gap-2.5">
            {members.map((m) => (
              <Checkbox
                key={m.id}
                label={m.name}
                checked={chosen.includes(m.id)}
                onCheckedChange={(on) =>
                  setChosen((list) => (on ? [...list, m.id] : list.filter((id) => id !== m.id)))
                }
              />
            ))}
          </div>
        </fieldset>
      </form>
    </SidePanel>
  );
}
