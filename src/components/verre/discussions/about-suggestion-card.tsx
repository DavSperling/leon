'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition } from 'react';
import {
  dismissAboutSuggestionAction,
  saveAboutSuggestionAction,
} from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import { Button, Field, GlassCard, Notice, Textarea, ToolIcon } from '@/components/verre';
import { PROVIDER_LABELS } from '@/lib/providers';
import { nb } from '@/lib/verre/nb';

type ErrorCode = 'tooLong' | 'empty' | 'failed';

/**
 * La proposition « About you » (onboarding, lot 5), une seule fois en haut du Chat. Sur le modèle d'AboutSettings :
 * « Save » la stocke comme « À propos » et la ferme, « Not now » la ferme. `max` vient du serveur (about.ts). « Save »
 * ne revalide rien (Next re-rendrait le Chat, et la carte partirait avant d'avoir montré `saved`) : la carte reste en
 * `saved` jusqu'à la navigation suivante, sans revenir puisque la proposition est fermée. « Not now » revalide le Chat :
 * la carte part avec ce rendu, ou par `gone`. Le focus ne tombe jamais sur <body> : il va au titre après « Save »
 * (le formulaire disparaît), au champ de question du Chat après « Not now ».
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
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [value, setValue] = useState(text);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [phase, setPhase] = useState<'editing' | 'saved' | 'gone'>('editing');
  const [saving, startSaving] = useTransition();
  const [dismissing, startDismissing] = useTransition();

  if (phase === 'gone') return null;

  // Un code d'erreur, traduit ici : un changement de langue suit. Un texte vide ne s'envoie pas (bouton grisé) ; s'il
  // arrivait quand même, il se dit comme une panne.
  const errorText = error === 'tooLong' ? t('tooLong', { max }) : t('failed');

  // Pas de `<form action>` : React remet le formulaire à zéro après une action, et le texte avec lui.
  const save = () => {
    if (saving || dismissing) return;
    setError(null);
    startSaving(async () => {
      const result = await saveAboutSuggestionAction(value);
      if ('error' in result) setError(result.error);
      else {
        // Le bouton « Save » va disparaître avec le formulaire : le focus part avant, sur le titre, d'où se lit « saved ».
        title.current?.focus();
        setPhase('saved');
      }
    });
  };
  const dismiss = () => {
    // Le champ de question du Chat (new-discussion-form.tsx) reste monté quand la carte part, par le rendu que l'action
    // déclenche ou par `gone` : le focus y va d'abord, avant que l'un ou l'autre ôte le bouton.
    document.getElementById('nouvelle-question')?.focus();
    startDismissing(async () => {
      await dismissAboutSuggestionAction();
      setPhase('gone');
    });
  };

  return (
    <section aria-labelledby={titleId} className="mb-8">
      <GlassCard variant="raised" signal className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2
            id={titleId}
            ref={title}
            tabIndex={-1}
            className="text-h2 font-semibold tracking-[-0.02em] text-fg"
          >
            {nb(t('title'))}
          </h2>
          {phase === 'editing' && <p className="mt-1 text-body text-muted">{nb(t('lead'))}</p>}
        </div>

        {phase === 'editing' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="grid gap-4"
          >
            <Field
              label={t('label')}
              help={t('hint', { max })}
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
                rows={5}
                autoGrow
              />
            </Field>

            <div className="grid gap-2">
              {kinds.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-label font-semibold text-fg-2">{nb(t('basedOn'))}</span>
                  <ul className="flex flex-wrap gap-2">
                    {kinds.map((kind) => (
                      <li key={kind} title={PROVIDER_LABELS[kind]}>
                        <ToolIcon kind={kind} boxed />
                        <span className="sr-only">{PROVIDER_LABELS[kind]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-label text-muted">{nb(t('basedOnNote'))}</p>
            </div>

            {error && (
              <Notice tone="error" live="alert">
                {errorText}
              </Notice>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={saving} loading={dismissing} onClick={dismiss}>
                {t('notNow')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={dismissing || value.trim() === ''}
                loading={saving}
              >
                {t('save')}
              </Button>
            </div>
          </form>
        )}

        {/* Toujours là, pour que le lecteur d'écran annonce le texte quand il arrive : vide, `sr-only` la garde dans
            l'arbre d'accessibilité sans lui donner de ligne dans la grille (`hidden` l'en sortirait). */}
        <div aria-live="polite" className="empty:sr-only">
          {phase === 'saved' && <Notice tone="success">{t('saved')}</Notice>}
        </div>

        <p className="text-label text-muted">
          {t.rich('whereNext', {
            link: (chunks) => (
              <Link
                href="/reglages#profil"
                className="rounded-sm text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </GlassCard>
    </section>
  );
}
