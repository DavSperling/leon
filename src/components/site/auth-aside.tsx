'use client';

import { Plug, Quote, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import { type Demo, TOOL_COUNT, useSiteContent } from './content';
import { DemoAnswerCard, DemoSourceRow } from './demo-card';
import { ParticleField, SplitWords, Tilt } from './fx';
import { Kicker, ToolLogo } from './parts';

// Panneau à côté du formulaire de connexion ou d'inscription (même mise en page, d'où usePathname) : à la connexion,
// le point du matin qui attend ; à l'inscription, les trois temps qui suivent la création de l'espace. Décoratif
// pour l'essentiel ; sous 1024 px, seuls les trois points restent, sous le formulaire.

// Les textes sont dans site.auth (messages) : ici, l'icône de chaque point et le numéro de chaque temps.
const POINTS = [
  { icon: Quote, key: 'sources' },
  { icon: Users, key: 'private' },
  { icon: Plug, key: 'tools' },
] as const;

const STEPS = [
  { n: '01', key: 'create' },
  { n: '02', key: 'connect' },
  { n: '03', key: 'ask' },
] as const;

function Points() {
  const t = useTranslations('site.auth.points');
  return (
    <ul className="grid gap-3">
      {POINTS.map((p) => (
        <li key={p.key} className="flex items-start gap-3 text-body leading-[1.55] text-fg-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
            <p.icon aria-hidden="true" strokeWidth={1.7} className="size-4" />
          </span>
          <span className="pt-1">{nb(t(p.key, { count: TOOL_COUNT }))}</span>
        </li>
      ))}
    </ul>
  );
}

function Briefing() {
  const common = useTranslations('site.common');
  const { briefing } = useSiteContent();
  return (
    <div className="signal-line relative overflow-hidden rounded-box border border-line bg-glass-2 p-5 shadow-hi">
      <div className="flex items-center gap-2">
        <Logo className="size-[18px] text-[9.5px]" />
        <span className="text-[13px] font-semibold text-accent">{common('briefing')}</span>
        <span className="ml-auto font-mono text-meta tracking-normal text-muted">08:45</span>
      </div>
      <div className="mt-4 grid gap-3.5">
        {briefing.map((part) => (
          <div key={part.title}>
            <p className="font-mono text-meta tracking-normal text-fg-2">{nb(part.title)}</p>
            <ul className="mt-1.5 grid gap-1">
              {part.items.map((it) => (
                <li key={it} className="flex gap-2 text-label leading-[1.5] text-muted">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1 shrink-0 rounded-full bg-accent"
                  />
                  {nb(it)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthAside() {
  const t = useTranslations('site.auth');
  const { demos, taglines } = useSiteContent();
  const signUp = usePathname() === '/inscription';
  const demo = demos[0] as Demo;
  return (
    <aside aria-label={t('aside')} className="min-w-0">
      {/* Petit écran : les trois points, sous le formulaire */}
      <div className="mx-auto mt-2 max-w-[440px] lg:hidden">
        <Points />
      </div>

      <div className="relative isolate max-lg:hidden">
        <div className="pointer-events-none absolute -inset-x-24 top-24 bottom-36 -z-10 opacity-70">
          <ParticleField density={0.75} height={1.4} />
        </div>
        <Kicker>{signUp ? t('signUpKicker') : t('signInKicker')}</Kicker>
        <h2 className="mt-4 max-w-[560px] text-[clamp(32px,3.6vw,48px)] leading-[1.04] font-extrabold tracking-[-0.045em] text-balance text-fg">
          {/* une clé par page : les mots rejouent leur entrée quand on passe de l'une à l'autre */}
          <SplitWords
            key={signUp ? 'inscription' : 'connexion'}
            delay={150}
            parts={
              signUp
                ? [{ text: t('signUpTitle') }]
                : [
                    { text: t('signInTitle') },
                    { text: t('signInTitleAccent'), className: 'site-gradient' },
                  ]
            }
          />
        </h2>
        <p className="mt-4 max-w-[520px] text-[16.5px] leading-[1.6] text-fg-2">
          {nb(taglines.pitch)}
        </p>

        {signUp ? (
          <>
            <ol className="mt-8 grid max-w-[560px] gap-2.5">
              {STEPS.map((s) => (
                <li key={s.key}>
                  <Tilt
                    max={5}
                    className="flex items-start gap-4 rounded-box border border-line bg-panel p-4 shadow-hi"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft font-mono text-label text-accent">
                      {s.n}
                    </span>
                    <span>
                      <span className="block text-ui font-semibold text-fg">
                        {nb(t(`steps.${s.key}.title`))}
                      </span>
                      <span className="mt-0.5 block text-label leading-[1.5] text-muted">
                        {nb(t(`steps.${s.key}.text`))}
                      </span>
                    </span>
                  </Tilt>
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="mt-6 flex flex-wrap items-center gap-2">
              {(
                [
                  'notion',
                  'github',
                  'hubspot',
                  'linear',
                  'granola',
                  'intercom',
                  'asana',
                  'outlook',
                ] as const
              ).map((id) => (
                <ToolLogo key={id} id={id} size={34} />
              ))}
              <span className="ml-1 font-mono text-meta tracking-normal text-muted">
                {nb(t('moreTools', { count: TOOL_COUNT - 8 }))}
              </span>
            </div>
            {/* les tarifs sont une proposition (pages/tarifs.tsx) : aucune promesse ferme ici */}
            <p className="mt-6 font-mono text-meta tracking-normal text-muted">
              {nb(t('noBilling'))}
            </p>
          </>
        ) : (
          <div
            aria-hidden="true"
            className="relative mt-8 grid max-w-[600px] gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
          >
            <Tilt className="grid content-start gap-2.5 rounded-box">
              <DemoAnswerCard demo={demo} />
              <ol className="fx-pop grid gap-2">
                <DemoSourceRow source={demo.sources[0] as Demo['sources'][number]} n={1} />
              </ol>
            </Tilt>
            <div className="site-float">
              <Tilt className="rounded-box">
                <Briefing />
              </Tilt>
            </div>
            <p className="px-1 font-mono text-meta tracking-normal text-muted xl:col-span-2">
              {nb(t('example'))}
            </p>
          </div>
        )}

        {!signUp && (
          <div className="mt-8">
            <Points />
          </div>
        )}
      </div>
    </aside>
  );
}
