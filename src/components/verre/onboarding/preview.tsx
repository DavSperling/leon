'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Avatar } from '@/components/verre/ui/avatar';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { DEPARTMENTS, isDepartment, jobLabelKey, seniorityId } from '@/lib/onboarding';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { Converge } from './converge';

export type AboutPreviewProps = {
  /** Le nom de l'espace ; null tant qu'un nouveau venu n'a pas saisi celui de son entreprise. */
  organization: string | null;
  userName: string;
  role: 'owner' | 'admin' | 'member';
  /** Ce qui est choisi à l'écran ("" tant que rien ne l'est) ; un identifiant inconnu se lit « Autre ». */
  department: string;
  job: string;
  seniority: number | null;
  /** Les outils que l'étape suivante propose : un outil conseillé qui n'y est pas encore ne s'annonce pas. */
  readyTools: readonly ProviderId[];
};

// Avant tout choix, sur un serveur qui ne branche rien en un clic : trois outils que tout le monde a.
const EVERYONE: readonly ProviderId[] = ['gmail', 'slack', 'drive'];

/** Une feuille qui porte un titre : « Vos outils de code ». */
export function PreviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassCard className="px-6 py-5">
      <h2 className="mb-4 text-title font-semibold text-fg">{title}</h2>
      {children}
    </GlassCard>
  );
}

/**
 * Un rectangle qui se lit sans s'ouvrir (un aperçu, un outil à venir) : les mesures de la tuile (52 px) ou de la
 * carte (88 px) du kit, sans ce qui dit « cliquez ». `end` : ce qui se pose au bout (une coche, une pastille d'état).
 */
export function StaticThing({
  size = 'tile',
  picture,
  name,
  caption,
  error,
  end,
  className,
}: {
  size?: 'tile' | 'card';
  picture?: ReactNode;
  name: ReactNode;
  caption?: ReactNode;
  error?: boolean;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'tl',
        size,
        error && 'is-err',
        'cursor-default hover:transform-none hover:border-line hover:shadow-[var(--sh-1)]',
        className,
      )}
    >
      {picture && (
        <span className="tl__pic">
          {picture}
          {error && <span className="tl__dot" />}
        </span>
      )}
      <span className="tl__id">
        <span className="tl__name">{name}</span>
        {caption != null && caption !== '' && <span className="tl__sub">{caption}</span>}
      </span>
      {end}
    </div>
  );
}

/**
 * Ce que Leon fera de ces réponses, qui suit les choix sans rien envoyer : une feuille. En tête, sur une bande de
 * bureau, les outils qu'il proposera de brancher, chacun relié à son point par un pointillé (ils passeront à l'encre à
 * l'étape Vos outils, et l'écran de fin rend la même feuille, tracée) ; dessous, la personne, puis deux questions
 * pour le Chat. Rien de choisi : trois outils sans légende, le nom et le rôle.
 */
export function AboutPreview({
  organization,
  userName,
  role,
  department,
  job,
  seniority,
  readyTools,
}: AboutPreviewProps) {
  const t = useTranslations('onboarding');
  const level = seniorityId(seniority);
  // Les outils et les exemples n'existent que pour un service de la liste.
  const listed = isDepartment(department) ? department : null;
  const ofJob: readonly ProviderId[] = listed ? DEPARTMENTS[listed].tools : [];
  // Ce que l'étape suivante proposera vraiment : eux seuls portent la légende « Leon vous proposera de brancher ».
  const suggested = ofJob.filter((tool) => readyTools.includes(tool));
  // Le dessin montre toujours de vrais outils reliés au point de Leon (des places vides ne disaient rien de ce qu'il
  // fait) : ceux du service ; avant tout choix, les premiers que ce serveur sait brancher, ou trois que tout le monde a.
  // Sans légende, en pointillé : une image de l'idée, pas une promesse.
  const tools =
    suggested.length > 0
      ? suggested
      : listed
        ? ofJob.slice(0, 4)
        : readyTools.length > 0
          ? readyTools.slice(0, 3)
          : EVERYONE;
  // Une légende, au plus : le poste et le niveau quand ils sont choisis, sinon le rôle dans l'espace.
  const caption =
    [job !== '' && t(jobLabelKey(department || null, job)), level && t(`seniority.${level}`)]
      .filter(Boolean)
      .join(' · ') || t(`preview.${role}`);
  return (
    <aside
      aria-label={
        organization === null ? t('preview.profile') : t('preview.profileIn', { organization })
      }
      className="min-w-0 lg:sticky lg:top-6"
    >
      <div className="overflow-hidden rounded-card border border-line bg-sheet shadow-lift">
        <div className="grid justify-items-center gap-2 border-b border-line bg-desk px-7 pt-5 pb-6 max-[599px]:px-5">
          <p
            className={cn(
              'min-h-5 justify-self-start text-label text-muted transition-opacity duration-150',
              suggested.length === 0 && 'opacity-0',
            )}
          >
            {t('preview.connect')}
          </p>
          <Converge
            className="ob-conv--offer"
            items={tools.map((tool) => ({ id: tool, on: false }))}
          />
          {suggested.length > 0 && (
            <ul className="sr-only">
              {suggested.map((tool) => (
                <li key={tool}>{PROVIDER_LABELS[tool]}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-5 p-7 max-[599px]:px-5 max-[599px]:py-6">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar name={userName} size={44} />
            <div className="min-w-0">
              <p className="truncate text-h2 font-semibold tracking-[-0.012em] text-fg">
                {userName}
              </p>
              <p className="text-ui [overflow-wrap:anywhere] text-muted">
                {[caption, organization].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          {listed && (
            // key : un autre service, d'autres questions, qui arrivent à leur tour.
            <div key={listed} className="rise-in grid gap-2.5 border-t border-line pt-5">
              <p className="text-label text-muted">{t('preview.ask')}</p>
              {/* Des questions, dans la forme et à la place qu'elles ont dans une discussion : à droite. */}
              <ul className="grid justify-items-end gap-2">
                {(['one', 'two'] as const).map((n) => (
                  <li
                    key={n}
                    className="rounded-card rounded-br-[4px] bg-n-150 px-4 py-2 text-ui text-pretty text-fg"
                  >
                    {t(`asks.${listed}.${n}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
