'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Demo } from '../content';
import { AnswerSheet } from '../demo-card';
import { motionHooks } from '../motion/hooks';

// Règle 3 de l'accueil : la même question, posée par Julie (qui a branché sa boîte mail) ou par Sophie (qui ne l'a
// pas). On ne rend que la réponse de la personne choisie : celle de Sophie ne contient jamais le mail de Julie.
// Le mouvement de l'accueil peut changer la personne au défilement (motion/hooks.ts) : il passe par `choose`, comme un clic.

export function RightsSwitch({ views }: { views: Demo[] }) {
  const t = useTranslations('site.home');
  const [index, setIndex] = useState(0);
  const now = useRef(index);
  now.current = index;
  const choose = (i: number) => {
    const commit = () => flushSync(() => setIndex(i));
    if (motionHooks.view) motionHooks.view(i, commit);
    else setIndex(i);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    motionHooks.showView = (i) => chooseRef.current(i);
    motionHooks.viewIndex = () => now.current;
    return () => {
      delete motionHooks.showView;
      delete motionHooks.viewIndex;
    };
  }, []);
  const view = views[index];
  if (!view) return null;
  return (
    <>
      <fieldset className="s-switch mb-6">
        <legend className="sr-only">{t('rightsGroup')}</legend>
        {views.map((v, i) => (
          <button key={v.id} type="button" aria-pressed={i === index} onClick={() => choose(i)}>
            {t('askedBy', { name: v.tab })}
          </button>
        ))}
      </fieldset>
      <div aria-live="polite">
        <AnswerSheet key={view.id} demo={view} />
      </div>
    </>
  );
}
