import { type CSSProperties, Fragment } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';

// Typographie animée du Récit, en CSS seul (visible sans JavaScript) : les mots du grand titre qui basculent en 3D, les
// heures en chiffres de pendule à volets, les lettres de « Je ne sais pas. » qui pivotent en place au défilement.
// Chaque fois, la version lue (sr-only) est d'un bloc et la version animée est cachée aux lecteurs d'écran.

export type RecitPart = {
  text: string;
  className?: string;
  /** Le morceau bascule d'un bloc (un surligné qui couvre plusieurs mots). */
  group?: boolean;
};

/** Titre dont chaque mot bascule depuis l'arrière (classes fx-word de fx.css), un groupe d'un seul tenant. */
export function RecitWords({ parts, delay = 0 }: { parts: RecitPart[]; delay?: number }) {
  let w = 0;
  const unit = (text: string, className: string | undefined, key: string) => {
    const i = w++;
    return (
      <span key={key} className={cn('fx-word', className)} style={{ '--w': i } as CSSProperties}>
        {text}
      </span>
    );
  };
  return (
    <span className="fx-words" style={{ '--fx-base': `${delay}ms` } as CSSProperties}>
      <span className="sr-only">{nb(parts.map((p) => p.text).join(''))}</span>
      <span aria-hidden="true">
        {parts.map((part, p) => {
          // on ne coupe que sur les espaces sécables : l'espace fine insécable de nb() (« connu ? ») reste dans le mot,
          // sinon le « ? » deviendrait un mot à part, seul en début de ligne
          const text = nb(part.text);
          if (part.group) {
            const lead = /^[ \t\n]/.test(text) ? ' ' : '';
            const tail = /[ \t\n]$/.test(text) ? ' ' : '';
            return [
              lead,
              unit(text.replace(/^[ \t\n]+|[ \t\n]+$/g, ''), part.className, `g${p}`),
              tail,
            ];
          }
          return text.split(/([ \t\n]+)/).map((word, k) => {
            if (word === '') return null;
            if (/^[ \t\n]+$/.test(word)) return word;
            return unit(word, part.className, `${p}-${k}`);
          });
        })}
      </span>
    </span>
  );
}

/** « 08:45 » en volets de pendule qui basculent quand le chapitre entre à l'écran (recit.css). */
export function FlipTime({ time, className }: { time: string; className?: string }) {
  let d = 0;
  return (
    <p className={cn('recit-flip', className)}>
      <span className="sr-only">{time}</span>
      {time.split('').map((ch, i) =>
        ch === ':' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: caractères d'une heure figée
          <span key={i} aria-hidden="true" className="recit-flip-colon">
            :
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: caractères d'une heure figée
            key={i}
            aria-hidden="true"
            className="recit-flip-digit"
            style={{ '--d': d++ } as CSSProperties}
          >
            {ch}
          </span>
        ),
      )}
    </p>
  );
}

/** Une phrase dont chaque lettre pivote en place au défilement ; les mots restent insécables. */
export function TiltLetters({ text: raw }: { text: string }) {
  let l = 0;
  const text = nb(raw);
  const words = text.split(' ');
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: mots d'une phrase figée
          <Fragment key={k}>
            <span className="inline-block whitespace-nowrap">
              {word.split('').map((ch, j) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: lettres d'une phrase figée
                  key={j}
                  className="recit-letter"
                  style={{ '--l': l++ } as CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </span>
            {k < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </>
  );
}
