'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  dismissAboutSuggestionAction,
  saveAboutSuggestionAction,
} from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import {
  Button,
  Field,
  Notice,
  PanelClose,
  PanelDone,
  PanelNote,
  SidePanel,
  Textarea,
  Thing,
  ThingGrid,
  ToolLogo,
} from '@/components/verre';
import { PROVIDER_LABELS } from '@/lib/providers';
import { nb } from '@/lib/verre/nb';

type ErrorCode = 'tooLong' | 'empty' | 'failed';

/** Ce qui prend le focus quand la carte s'en va : le titre de l'Accueil. */
export const HOME_TITLE_ID = 'accueil-titre';

/**
 * La proposition « About you » (onboarding, lot 5), une seule fois, en carte sur l'Accueil ; un clic l'ouvre dans le
 * panneau. « Save » la stocke comme « À propos » et la ferme ; « Not now » la ferme. `max` vient du serveur (about.ts).
 * « Save » ne revalide rien (Next re-rendrait l'Accueil, et le panneau partirait avant d'avoir dit « saved ») : le
 * panneau dit « saved », et la carte s'en va quand on le ferme. « Not now » revalide l'Accueil. Le focus ne tombe jamais
 * sur <body> : il va au titre de l'Accueil quand la carte part.
 */
export function AboutSuggestionCard({
  text,
  kinds,
  max,
}: {
  text: string;
  kinds: ProviderId[];
  max: number;
}) {
  const t = useTranslations('aboutSuggestion');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [phase, setPhase] = useState<'editing' | 'saved' | 'gone'>('editing');
  const [saving, startSaving] = useTransition();
  const [dismissing, startDismissing] = useTransition();

  if (phase === 'gone') return null;

  // Un code d'erreur, traduit ici : un changement de langue suit.
  const errorText = error === 'tooLong' ? t('tooLong', { max }) : t('failed');
  const leave = () => {
    document.getElementById(HOME_TITLE_ID)?.focus();
    setPhase('gone');
  };

  const save = () => {
    if (saving || dismissing) return;
    setError(null);
    startSaving(async () => {
      const result = await saveAboutSuggestionAction(value);
      if ('error' in result) setError(result.error);
      else setPhase('saved');
    });
  };
  const dismiss = () => {
    startDismissing(async () => {
      await dismissAboutSuggestionAction();
      setOpen(false);
      leave();
    });
  };

  return (
    <>
      {/* une tuile discrète, large comme une question à essayer : ni bannière, ni logo d'un outil pour parler de vous */}
      <ThingGrid cols={3}>
        <Thing name={nb(t('title'))} onClick={() => setOpen(true)} />
      </ThingGrid>
      <SidePanel
        open={open}
        onOpenChange={(next) => {
          if (saving || dismissing) return;
          setOpen(next);
          // enregistrée : la proposition est fermée, la carte s'en va avec le panneau
          if (!next && phase === 'saved') leave();
        }}
        title={nb(t('title'))}
        busy={saving || dismissing}
        foot={
          phase === 'saved' ? undefined : (
            <>
              <Button
                variant="quiet"
                className="-ml-4"
                disabled={saving}
                loading={dismissing}
                onClick={dismiss}
              >
                {t('notNow')}
              </Button>
              <Button
                type="submit"
                form="a-propos-proposition"
                variant="primary"
                className="ml-auto"
                disabled={dismissing || value.trim() === ''}
                loading={saving}
              >
                {t('save')}
              </Button>
            </>
          )
        }
        note={
          phase === 'saved'
            ? undefined
            : t.rich('whereNext', {
                link: (chunks) => (
                  <PanelClose asChild>
                    <Link href="/reglages#profil" className="text-fg underline underline-offset-4">
                      {chunks}
                    </Link>
                  </PanelClose>
                ),
              })
        }
      >
        {phase === 'saved' ? (
          <PanelDone title={t('saved')} />
        ) : (
          <form
            id="a-propos-proposition"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="grid gap-4"
          >
            <Field
              label={t('label')}
              aside={
                <span className="text-muted tabular-nums">
                  {value.length} / {max}
                </span>
              }
            >
              <Textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                maxLength={max}
                rows={6}
                autoGrow
              />
            </Field>
            {kinds.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-label font-medium text-muted">{nb(t('basedOn'))}</span>
                <ul className="flex flex-wrap gap-2">
                  {kinds.map((kind) => (
                    <li key={kind} title={PROVIDER_LABELS[kind]}>
                      <ToolLogo kind={kind} size={18} />
                      <span className="sr-only">{PROVIDER_LABELS[kind]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* la promesse : rien que la personne ne pourrait ouvrir elle-même */}
            <PanelNote>{nb(t('basedOnNote'))}</PanelNote>
            {error && (
              <Notice tone="error" live="alert">
                {errorText}
              </Notice>
            )}
          </form>
        )}
      </SidePanel>
    </>
  );
}
