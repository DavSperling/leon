'use client';

import { Plug, Quote, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import { BRIEFING, DEMOS, type Demo, TAGLINES, TOOL_COUNT } from './content';
import { DemoAnswerCard, DemoSourceRow } from './demo-card';
import { Kicker, ToolLogo } from './parts';

// Panneau à côté du formulaire de connexion ou d'inscription (même mise en page, d'où usePathname) : à la connexion,
// le point du matin qui attend ; à l'inscription, les trois temps qui suivent la création de l'espace. Décoratif
// pour l'essentiel ; sous 1024 px, seuls les trois points restent, sous le formulaire.

const POINTS = [
  { icon: Quote, text: 'Chaque réponse cite sa source, ou dit « je ne sais pas ».' },
  { icon: Users, text: 'Vos conversations d’IA et vos discussions restent privées.' },
  { icon: Plug, text: `${TOOL_COUNT} outils branchables, relevés toutes les 15 minutes.` },
] as const;

const STEPS = [
  { n: '01', title: 'Créez l’espace', text: 'Votre nom, votre e-mail, le nom de l’entreprise.' },
  {
    n: '02',
    title: 'Branchez un premier outil',
    text: 'Une clé d’API ou un bouton de connexion, dans Connexions.',
  },
  {
    n: '03',
    title: 'Posez une première question',
    text: 'Leon cherche dans ce qu’il a gardé et cite ses sources.',
  },
] as const;

function Points() {
  return (
    <ul className="grid gap-3">
      {POINTS.map((p) => (
        <li key={p.text} className="flex items-start gap-3 text-body leading-[1.55] text-fg-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
            <p.icon aria-hidden="true" strokeWidth={1.7} className="size-4" />
          </span>
          <span className="pt-1">{nb(p.text)}</span>
        </li>
      ))}
    </ul>
  );
}

function Briefing() {
  return (
    <div className="signal-line relative overflow-hidden rounded-box border border-line bg-glass-2 p-5 shadow-hi">
      <div className="flex items-center gap-2">
        <Logo className="size-[18px] text-[9.5px]" />
        <span className="text-[13px] font-semibold text-accent">Point du matin</span>
        <span className="ml-auto font-mono text-meta tracking-normal text-muted">08:45</span>
      </div>
      <div className="mt-4 grid gap-3.5">
        {BRIEFING.map((part) => (
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
  const signUp = usePathname() === '/inscription';
  const demo = DEMOS[0] as Demo;
  return (
    <aside aria-label="Leon en bref" className="min-w-0">
      {/* Petit écran : les trois points, sous le formulaire */}
      <div className="mx-auto mt-2 max-w-[440px] lg:hidden">
        <Points />
      </div>

      <div className="relative max-lg:hidden">
        <Kicker>{signUp ? 'En trois temps' : 'Bon retour'}</Kicker>
        <h2 className="mt-4 max-w-[560px] text-[clamp(32px,3.6vw,48px)] leading-[1.04] font-extrabold tracking-[-0.045em] text-balance text-fg">
          {signUp ? (
            nb('Créez l’espace, branchez un outil, posez une question.')
          ) : (
            <>
              {nb('Ce qui a été dit ')}
              <span className="site-gradient">{nb('reste dit.')}</span>
            </>
          )}
        </h2>
        <p className="mt-4 max-w-[520px] text-[16.5px] leading-[1.6] text-fg-2">
          {nb(TAGLINES.pitch)}
        </p>

        {signUp ? (
          <>
            <ol className="mt-8 grid max-w-[560px] gap-2.5">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className="site-lift flex items-start gap-4 rounded-box border border-line bg-panel p-4 shadow-hi"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft font-mono text-label text-accent">
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-ui font-semibold text-fg">{nb(s.title)}</span>
                    <span className="mt-0.5 block text-label leading-[1.5] text-muted">
                      {nb(s.text)}
                    </span>
                  </span>
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
                {nb(`et ${TOOL_COUNT - 8} autres`)}
              </span>
            </div>
            <p className="mt-6 font-mono text-meta tracking-normal text-muted">
              Pilote gratuit de 30 jours · sans carte bancaire
            </p>
          </>
        ) : (
          <div
            aria-hidden="true"
            className="relative mt-8 grid max-w-[600px] gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
          >
            <div className="grid content-start gap-2.5">
              <DemoAnswerCard demo={demo} />
              <ol className="grid gap-2">
                <DemoSourceRow source={demo.sources[0] as Demo['sources'][number]} n={1} />
              </ol>
            </div>
            <div className="site-float">
              <Briefing />
            </div>
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
