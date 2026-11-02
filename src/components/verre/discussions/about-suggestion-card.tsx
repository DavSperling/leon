'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, useTransition } from 'react';
import {
  dismissAboutSuggestionAction,
  saveAboutSuggestionAction,
} from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import { Button, Field, GlassCard, Notice, Textarea, ToolIcon } from '@/components/verre';
import { PROVIDER_LABELS } from '@/lib/providers';
import { nb } from '@/lib/verre/nb';

// Le temps de lire « saved » avant que la carte se masque.
const SAVED_MS = 5000;

type ErrorCode = 'tooLong' | 'empty' | 'failed';

/**
 * La proposition « About you » (onboarding, lot 5), une seule fois en haut du Chat. Sur le modèle d'AboutSettings :
 * « Save » la stocke comme « À propos » et la ferme, « Not now » la ferme. `max` vient du serveur (about.ts). « Save »
 * ne revalide pas le Chat : c'est cette carte qui se masque, après avoir montré `saved`.
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
  const [value, setValue] = useState(text);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [phase, setPhase] = useState<'editing' | 'saved' | 'gone'>('editing');
  const [saving, startSaving] = useTransition();
  const [dismissing, startDismissing] = useTransition();

  useEffect(() => {
    if (phase !== 'saved') return;
    const timer = setTimeout(() => setPhase('gone'), SAVED_MS);
    return () => clearTimeout(timer);
  }, [phase]);

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
      else setPhase('saved');
    });
  };
  const dismiss = () =>
    startDismissing(async () => {
      await dismissAboutSuggestionAction();
      setPhase('gone');
    });

  return (
    <section aria-labelledby={titleId} className="mb-8">
      <GlassCard variant="raised" signal className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2 id={titleId} className="text-h2 font-semibold tracking-[-0.02em] text-fg">
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

        {/* Toujours là, pour que le lecteur d'écran annonce le texte quand il arrive. */}
        <div aria-live="polite" className="empty:hidden">
          {phase === 'saved' && <Notice tone="success">{t('saved')}</Notice>}
        </div>
      </GlassCard>
    </section>
  );
}
