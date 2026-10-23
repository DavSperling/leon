import { ArrowUpRight } from 'lucide-react';
import { Fraunces } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import {
  ALL_TOOLS,
  BRIEFING,
  DEMOS,
  type Demo,
  NOT_YET,
  TAGLINES,
  TOOL_COUNT,
  TOOL_GROUPS,
  toolLabel,
} from '../content';
import { DemoAnswerCard, DemoSearchField, DemoSourceRow } from '../demo-card';
import { LogoSphere, ParticleField, Tilt } from '../fx';
import {
  ArrowLink,
  CitedAnswer,
  Container,
  CtaLink,
  Excerpt,
  Kicker,
  LeonMark,
  QueryCode,
  ToolLogo,
} from '../parts';
import { Parallax } from './recit/parallax';
import { FlipTime, RecitWords, TiltLetters } from './recit/words';
import './recit.css';

// Maquette 3 « Récit » : l'accueil raconté comme un article, « Une journée avec Leon ». Un grand titre en Fraunces
// (la police d'affichage de brand.md), puis cinq moments d'une journée sur une ligne de temps qui se remplit au
// défilement, chacun avec sa vignette de l'appli en données fictives. La profondeur vient des effets partagés (fx/) :
// le titre bascule mot à mot, les vignettes se déplient en 3D et s'inclinent vers le pointeur, les heures tournent comme
// des volets de pendule, « Je ne sais pas. » pivote lettre à lettre. Le mouvement réduit laisse l'état final.

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
  variable: '--font-fraunces',
});

const [promesse, bug, depart, inconnu] = DEMOS as [Demo, Demo, Demo, Demo];

// ---------- Vignettes (l'appli, en données fictives) ----------

function Vignette({
  caption,
  children,
  className,
  solid,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
  /** Fond presque opaque : la carte passe devant d'autres (l'éventail), qu'on ne doit pas lire au travers. */
  solid?: boolean;
}) {
  return (
    // le dépli au défilement sur l'enveloppe, l'inclinaison au pointeur sur la carte : deux transforms qui ne se gênent pas
    <div className={cn('recit-unfold', className)}>
      <Tilt max={5} className="rounded-panel">
        {/* le verre est un calque à part : un flou d'arrière-plan sur la carte aplatirait sa 3D */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 rounded-panel border border-line-strong shadow-panel',
            solid
              ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--menu)_97%,transparent),color-mix(in_srgb,var(--menu)_92%,transparent))]'
              : 'bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] backdrop-blur-[30px]',
          )}
        />
        <figure className="relative p-3 [transform-style:preserve-3d] sm:p-4">
          <div className="fx-pop" style={{ '--pop': '18px' } as CSSProperties}>
            {children}
          </div>
          <figcaption
            className="fx-pop mt-3 px-1 font-mono text-meta tracking-normal text-muted"
            style={{ '--pop': '8px' } as CSSProperties}
          >
            {nb(`Exemple fictif · ${caption}`)}
          </figcaption>
        </figure>
      </Tilt>
    </div>
  );
}

function BriefingVignette() {
  return (
    <Vignette caption="le point du matin">
      <div className="signal-line relative overflow-hidden rounded-box border border-line bg-glass-2 px-5 pt-4 pb-5 shadow-hi">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LeonMark label="Point du matin" />
          <span className="ml-auto font-mono text-meta tracking-normal text-muted">
            jeu. 23 oct. · 08:45
          </span>
        </div>
        <p className="mt-1.5 font-mono text-meta tracking-normal text-muted">
          {nb('› au démarrage de votre assistant de code')}
        </p>
        <div className="mt-4 grid gap-4">
          {BRIEFING.map((part) => (
            <section key={part.title}>
              <h4 className="text-label font-semibold text-accent">{nb(part.title)}</h4>
              <ul className="mt-1.5 grid gap-1">
                {part.items.map((item) => (
                  <li
                    key={item}
                    className="relative pl-4 text-ui leading-[1.55] text-fg-2 before:absolute before:top-[0.62em] before:left-0.5 before:size-[5px] before:rounded-full before:bg-line-strong"
                  >
                    {nb(item)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-4 border-t border-line pt-3 font-mono text-meta tracking-normal text-muted">
          préparé à l’avance · 250 mots au plus
        </p>
      </div>
    </Vignette>
  );
}

function RendezVousVignette() {
  return (
    <Vignette caption="l’écran Recherche">
      <DemoSearchField query={nb(promesse.query)} />
      <DemoAnswerCard demo={promesse} className="mt-3" />
      <ol className="mt-3 grid gap-2">
        {promesse.sources.slice(0, 2).map((s, i) => (
          <DemoSourceRow key={s.title} source={s} n={i + 1} active={i === 0} />
        ))}
      </ol>
    </Vignette>
  );
}

function PerimetreVignette() {
  const devis = promesse.sources[1];
  if (!devis) return null;
  return (
    <Vignette caption="une phrase exacte, retrouvée">
      <DemoSearchField query={<QueryCode q={'"reprise des données"'} />} />
      <div className="relative mt-3 overflow-hidden rounded-box border border-line bg-glass-2 px-6 pt-5 pb-6 shadow-hi">
        <p className="font-mono text-meta tracking-normal text-muted">
          {devis.kind} · {nb(devis.title)} · {devis.date}
        </p>
        <blockquote className="recit-display mt-3 border-l-2 border-accent pl-5 text-[clamp(21px,2.3vw,27px)] leading-[1.32] text-fg">
          <Excerpt text={devis.excerpt} />
        </blockquote>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <ToolLogo id={devis.tool} size={26} />
          <span className="text-label text-fg-2">
            {nb(`${devis.author}, signé par le client le ${devis.date}`)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-label font-semibold text-accent">
            Ouvrir dans {toolLabel(devis.tool)}
            <ArrowUpRight aria-hidden="true" strokeWidth={2} className="size-3.5" />
          </span>
        </div>
      </div>
    </Vignette>
  );
}

function DiscussionVignette() {
  return (
    <Vignette caption="une discussion avec Leon">
      <div className="rounded-box border border-line bg-glass-2 px-4 pt-4 pb-5 shadow-hi sm:px-5">
        <p className="font-mono text-meta tracking-normal text-muted">
          Discussion · visible de vous seul
        </p>
        <p className="recit-bubble mt-4 ml-auto w-fit max-w-[85%] border border-accent-line bg-accent-soft px-4 py-2.5 text-ui font-medium text-fg">
          {nb('Ce bug d’export PDF est-il connu ?')}
        </p>
        <div className="mt-4">
          <LeonMark label="Leon" />
          <CitedAnswer text={bug.answer} className="mt-2 text-[15px] leading-[1.7] text-fg" />
        </div>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {bug.sources.map((s, i) => (
            <li
              key={s.title}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-glass-3 py-1 pr-3 pl-1"
            >
              <ToolLogo id={s.tool} size={20} />
              <span className="font-mono text-[11px] text-accent">[{i + 1}]</span>
              <span className="truncate text-label text-fg-2">{nb(s.title)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Vignette>
  );
}

function PassationVignette() {
  return (
    <Vignette caption="ce qui reste après un départ">
      <DemoSearchField query={nb(depart.query)} />
      <DemoAnswerCard demo={depart} className="mt-3" />
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {depart.sources.map((s, i) => (
          <li
            key={s.title}
            className="grid content-start gap-2.5 rounded-card border border-line bg-panel p-3.5 shadow-hi"
          >
            <div className="flex items-center gap-2">
              <ToolLogo id={s.tool} size={26} />
              <span className="font-mono text-[11px] text-accent">[{i + 1}]</span>
              <span className="ml-auto font-mono text-meta tracking-normal text-muted">
                {s.kind}
              </span>
            </div>
            <span className="text-label leading-[1.4] font-semibold text-fg">{nb(s.title)}</span>
            <span className="font-mono text-meta tracking-normal text-muted">{s.date}</span>
          </li>
        ))}
      </ol>
    </Vignette>
  );
}

// ---------- La journée ----------

type Chapter = {
  id: string;
  time: string;
  label: string;
  title: ReactNode;
  text: string[];
  vignette: ReactNode;
};

const CHAPTERS: Chapter[] = [
  {
    id: 'matin',
    time: '08:45',
    label: 'Le point du matin',
    title: (
      <>
        La journée reprend là où elle s’était <em>arrêtée</em>.
      </>
    ),
    text: [
      'Avant la première question, Leon a préparé le point : ce que vous avez fait, ce qui a bougé autour de vous, ce qui reste ouvert.',
      'Il tient en 250 mots au plus et attend au démarrage de votre assistant de code. Ailleurs, il s’appelle par MCP.',
    ],
    vignette: <BriefingVignette />,
  },
  {
    id: 'rendez-vous',
    time: '10:30',
    label: 'Avant le rendez-vous',
    title: (
      <>
        Le client arrive dans une <em>demi-heure</em>.
      </>
    ),
    text: [
      'Karim veut savoir ce qui a été promis à ACME. Une seule recherche couvre la réunion enregistrée, la note du CRM et le ticket de suivi.',
      'La réponse arrive au-dessus des résultats. Chaque phrase renvoie à sa source.',
    ],
    vignette: <RendezVousVignette />,
  },
  {
    id: 'perimetre',
    time: '14:00',
    label: 'Le périmètre',
    title: (
      <>
        « Ce n’était pas <em>prévu</em> ? »
      </>
    ),
    text: [
      'Le client affirme que la reprise des données faisait partie du contrat. Personne ne se souvient du détail.',
      'Le devis signé, lui, est gardé tel quel. Entre guillemets, la phrase exacte retrouve l’endroit où elle a été écrite, et l’original s’ouvre d’un clic.',
    ],
    vignette: <PerimetreVignette />,
  },
  {
    id: 'support',
    time: '16:20',
    label: 'Le support',
    title: (
      <>
        Ce bug est-il <em>connu</em> ?
      </>
    ),
    text: [
      'Trois conversations de support parlent d’un PDF vide. Leon relie ce que les clients écrivent au ticket qui le reproduit et à la PR qui le corrige.',
      'La discussion reste visible de vous seul, et chaque affirmation porte sa source.',
    ],
    vignette: <DiscussionVignette />,
  },
  {
    id: 'passation',
    time: '18:10',
    label: 'La passation',
    title: (
      <>
        Thomas part en fin de <em>semaine</em>.
      </>
    ),
    text: [
      'Ce qu’il suivait vit dans ses tâches, ses réunions et ses notes. Leon le garde après son départ.',
      'La passation ne dépend plus de sa mémoire, ni de celle de ses collègues.',
    ],
    vignette: <PassationVignette />,
  },
];

function Timeline() {
  return (
    <ol className="relative mt-16 grid gap-24 sm:mt-20 lg:gap-32">
      {/* la ligne et son remplissage au défilement ; sur mobile, au bord gauche */}
      <span
        aria-hidden="true"
        className="absolute top-2 bottom-0 left-[5px] w-px bg-line lg:left-[188px]"
      />
      <span
        aria-hidden="true"
        className="site-timeline-fill absolute top-2 bottom-0 left-[5px] w-px bg-[linear-gradient(180deg,var(--accent),var(--logo-2)_70%,transparent)] lg:left-[188px]"
      />
      {/* tête lumineuse qui descend avec le remplissage (même boîte, donc même avancement) */}
      <span
        aria-hidden="true"
        className="recit-head-track absolute top-2 bottom-0 left-[5px] w-px lg:left-[188px]"
      >
        <span className="recit-head absolute inset-0">
          <span className="recit-head-dot absolute bottom-0 left-1/2" />
        </span>
      </span>
      {CHAPTERS.map((c) => (
        <li
          key={c.id}
          id={`recit-${c.id}`}
          className="recit-chapter relative grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-6 pl-8 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-14 lg:pl-0"
        >
          <span
            aria-hidden="true"
            className="absolute top-[9px] left-0 size-[11px] rounded-full border border-line-strong bg-bg lg:left-[183px]"
          >
            <span className="recit-dot-on absolute -inset-px rounded-full bg-accent" />
          </span>
          <div className="lg:sticky lg:top-28 lg:self-start lg:text-right">
            <FlipTime time={c.time} className="text-[30px] lg:justify-end lg:text-[34px]" />
            <p className="mt-2 font-mono text-meta tracking-[0.08em] text-accent uppercase">
              {nb(c.label)}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-12">
            <div className="max-w-[520px]">
              <h3 className="recit-display text-[clamp(30px,2.9vw,40px)] leading-[1.08] text-balance text-fg">
                {c.title}
              </h3>
              {c.text.map((t) => (
                <p key={t} className="mt-4 text-[16.5px] leading-[1.7] text-pretty text-fg-2">
                  {nb(t)}
                </p>
              ))}
            </div>
            {c.vignette}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------- Sections ----------

function Hero() {
  return (
    <header className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div
        aria-hidden="true"
        className="site-dots pointer-events-none absolute inset-0 opacity-35"
      />
      <div className="pointer-events-none absolute inset-x-0 top-[34%] h-[78%] opacity-85">
        <ParticleField density={0.7} height={1.35} />
      </div>
      <Container className="relative">
        <Parallax depth={6}>
          <div
            className="site-rise flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-meta tracking-[0.08em] text-muted uppercase"
            style={{ '--i': 0 } as CSSProperties}
          >
            <span className="text-accent">Récit</span>
            <span aria-hidden="true" className="recit-rule h-px min-w-10 flex-1" />
            <span className="max-sm:hidden">Une journée avec Leon</span>
            <span aria-hidden="true" className="max-sm:hidden">
              ·
            </span>
            <time dateTime="2026-10-23">jeudi 23 octobre 2026</time>
          </div>
        </Parallax>

        <Tilt
          max={3}
          scale={1}
          perspective={1600}
          glare={false}
          className="mt-10 max-w-[1080px] sm:mt-14"
        >
          <h1 className="recit-display text-[clamp(46px,8.4vw,118px)] leading-[0.98] text-balance text-fg">
            <RecitWords
              delay={150}
              parts={[
                { text: 'Quand quelqu’un part, ce qu’il ' },
                { text: 'a promis', group: true, className: 'recit-hl recit-hero-hl recit-italic' },
                { text: ' reste.' },
              ]}
            />
          </h1>
        </Tilt>

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 sm:mt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
          <div className="site-rise" style={{ '--i': 2 } as CSSProperties}>
            <p className="recit-dropcap max-w-[560px] text-[18px] leading-[1.65] text-pretty text-fg-2 max-sm:text-[16.5px]">
              {nb(
                `${TAGLINES.pitch} Leon garde ce qui se dit dans vos outils et vos conversations d’IA, tel quel et avec ses droits.`,
              )}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <CtaLink href="/inscription">Créer un espace</CtaLink>
              <CtaLink href="/cas-usage" variant="secondary">
                Lire les cas d’usage
              </CtaLink>
            </div>
          </div>

          <Parallax depth={-10}>
            <nav
              aria-label="Sommaire de la journée"
              className="site-rise"
              style={{ '--i': 3 } as CSSProperties}
            >
              <p className="font-mono text-meta tracking-[0.08em] text-muted uppercase">
                Au sommaire
              </p>
              <ol className="mt-4 border-t border-line">
                {CHAPTERS.map((c) => (
                  <li key={c.id} className="border-b border-line">
                    <a
                      href={`#recit-${c.id}`}
                      className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 py-3.5 transition-colors duration-200"
                    >
                      <span className="recit-time font-mono text-label text-accent">{c.time}</span>
                      <span className="text-[15.5px] font-medium text-fg-2 transition-colors duration-200 group-hover:text-fg">
                        {nb(c.label)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-meta text-muted transition-transform duration-300 ease-out group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </a>
                  </li>
                ))}
                <li className="border-b border-line">
                  <a
                    href="#recit-inconnu"
                    className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 py-3.5"
                  >
                    <span className="font-mono text-label text-muted">—</span>
                    <span className="recit-display recit-italic text-[17px] text-fg-2 transition-colors duration-200 group-hover:text-fg">
                      Et quand on ne sait pas
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-mono text-meta text-muted transition-transform duration-300 ease-out group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </a>
                </li>
              </ol>
            </nav>
          </Parallax>
        </div>
      </Container>
    </header>
  );
}

function Journee() {
  return (
    <section aria-labelledby="recit-journee" className="relative py-20 sm:py-28">
      <Container>
        <div className="site-reveal grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-14">
          <Kicker className="lg:justify-end lg:pt-3">La journée</Kicker>
          <div className="max-w-[760px]">
            <h2
              id="recit-journee"
              className="recit-display text-[clamp(34px,5vw,60px)] leading-[1.04] text-balance text-fg"
            >
              Une journée ordinaire, dans une équipe de <em>trente</em> personnes.
            </h2>
            <p className="mt-5 max-w-[600px] text-[17px] leading-[1.65] text-pretty text-fg-2">
              {nb(
                'Les personnes et les clients sont inventés. Les écrans sont ceux de Leon : la recherche, la réponse citée, la discussion, le point du matin.',
              )}
            </p>
          </div>
        </div>
        <Timeline />
      </Container>
    </section>
  );
}

/** Carte de l'éventail : une recherche restée sans résultat (décorative). */
function GhostCard({ side }: { side: 'l' | 'r' }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'recit-fan-card absolute inset-x-4 top-4 bottom-6 grid content-end rounded-panel border border-line bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-4 shadow-panel',
        side === 'l' ? 'recit-fan-l justify-items-start' : 'recit-fan-r justify-items-end',
      )}
    >
      {/* des formes seules, au bord extérieur : c'est la partie qui dépasse de la carte de devant */}
      <span className="h-7 w-16 rounded-full border border-line bg-glass-3" />
      <span className="mt-3 h-2 w-12 rounded-full bg-line-strong" />
      <span className="mt-2 h-2 w-8 rounded-full bg-line" />
    </div>
  );
}

function Inconnu() {
  return (
    <section
      id="recit-inconnu"
      aria-labelledby="recit-inconnu-titre"
      className="relative scroll-mt-24 overflow-x-clip py-24 sm:py-32"
    >
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute inset-0 opacity-70"
      />
      <Container className="relative text-center">
        <Kicker className="justify-center">Et quand on ne sait pas</Kicker>
        <h2
          id="recit-inconnu-titre"
          className="recit-nsp recit-display mx-auto mt-6 text-[clamp(56px,11vw,150px)] leading-[0.95] text-fg"
        >
          <em className="recit-hl recit-hl-scroll">
            <TiltLetters text="Je ne sais pas." />
          </em>
        </h2>
        <p className="site-reveal mx-auto mt-8 max-w-[560px] text-[17px] leading-[1.65] text-pretty text-fg-2">
          {nb(
            'Une question sans source reçoit une réponse franche. Leon dit ce qu’il a trouvé, et ce qu’il n’a pas trouvé. Il ne devine pas.',
          )}
        </p>
        {/* les recherches qui n'ont rien donné, en éventail derrière la réponse */}
        <div className="recit-fan relative mx-auto mt-12 max-w-[640px] text-left">
          <GhostCard side="l" />
          <GhostCard side="r" />
          <Vignette caption="une question sans réponse" className="relative" solid>
            <DemoSearchField query={nb(inconnu.query)} />
            <DemoAnswerCard demo={inconnu} className="mt-3" />
          </Vignette>
        </div>
      </Container>
    </section>
  );
}

const REFUSALS = [
  {
    title: 'Il ne résume pas.',
    text: 'Il garde le brut, tel qu’il a été écrit, et le retrouve. Les réponses citent ce brut, avec un lien vers l’original.',
  },
  {
    title: 'Il ne tient pas de fiches.',
    text: 'Personne ne remplit rien pour lui, et il ne réécrit pas l’histoire de vos clients.',
  },
  {
    title: 'Il ne devine pas.',
    text: 'Sans source, la réponse est « je ne sais pas », jamais une supposition.',
  },
] as const;

function Franc() {
  return (
    <section aria-labelledby="recit-franc" className="relative py-20 sm:py-28">
      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
          <div className="site-reveal lg:sticky lg:top-28 lg:self-start">
            <Kicker>Franchement</Kicker>
            <h2
              id="recit-franc"
              className="recit-display mt-4 text-[clamp(34px,4.6vw,56px)] leading-[1.04] text-balance text-fg"
            >
              Ce que Leon <em>ne fait pas</em>.
            </h2>
            <p className="mt-5 max-w-[420px] text-[17px] leading-[1.65] text-fg-2">
              {nb('Autant le dire avant que vous le découvriez.')}
            </p>
          </div>

          <div>
            <ol className="border-t border-line-strong">
              {REFUSALS.map((r, i) => (
                <li
                  key={r.title}
                  className="site-reveal grid grid-cols-[56px_minmax(0,1fr)] gap-5 border-b border-line py-7 sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-8"
                >
                  <span
                    aria-hidden="true"
                    className="recit-numeral text-[44px] text-accent sm:text-[60px]"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="recit-display text-[clamp(24px,2.6vw,30px)] leading-[1.15] text-fg">
                      {nb(r.title)}
                    </h3>
                    <p className="mt-2 max-w-[520px] text-[16px] leading-[1.65] text-fg-2">
                      {nb(r.text)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="site-reveal mt-12 rounded-box border border-line bg-glass-3 p-5 sm:p-7">
              <h3 className="font-mono text-meta tracking-[0.08em] text-muted uppercase">
                Et ce qui n’est pas encore là
              </h3>
              <ul className="mt-4 grid gap-3">
                {NOT_YET.map((item) => (
                  <li
                    key={item}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 text-ui leading-[1.6] text-fg-2"
                  >
                    <span className="rounded-full border border-warning-line bg-warning-soft px-2 py-px font-mono text-[10.5px] tracking-normal text-warning">
                      pas encore
                    </span>
                    {nb(item)}
                  </li>
                ))}
              </ul>
            </div>

            <p className="site-reveal recit-display recit-italic mt-12 text-[clamp(26px,3vw,36px)] leading-[1.2] text-balance text-fg">
              Nous sommes deux, et nous préférons le dire.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Index() {
  return (
    <section aria-labelledby="recit-index" className="relative pt-8 pb-20 sm:pt-12 sm:pb-28">
      <Container>
        <div className="site-reveal flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[720px]">
            <Kicker>Index</Kicker>
            <h2
              id="recit-index"
              className="recit-display mt-4 text-[clamp(34px,4.6vw,56px)] leading-[1.04] text-balance text-fg"
            >
              {TOOL_COUNT} outils, relevés toutes les <em>quinze minutes</em>.
            </h2>
            <p className="mt-5 max-w-[600px] text-[17px] leading-[1.65] text-pretty text-fg-2">
              {nb(
                'Et les conversations avec vos assistants d’IA, par l’extension du navigateur et par votre assistant de code. Chaque élément reste lié à son original.',
              )}
            </p>
          </div>
          <ArrowLink href="/connecteurs">Voir les connecteurs</ArrowLink>
        </div>

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          <dl className="site-reveal border-t border-line-strong max-lg:order-2">
            {TOOL_GROUPS.map((g) => (
              <div
                key={g.family}
                className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-line py-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8"
              >
                <dt className="flex items-baseline gap-3 md:pt-1.5">
                  <span className="font-mono text-meta tracking-[0.08em] text-fg uppercase">
                    {g.label}
                  </span>
                  <span className="font-mono text-meta text-muted">
                    {String(g.tools.length).padStart(2, '0')}
                  </span>
                </dt>
                <dd>
                  <ul className="flex flex-wrap gap-x-2 gap-y-2">
                    {g.tools.map((id) => (
                      <li
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-glass-3 py-1 pr-3.5 pl-1"
                      >
                        <ToolLogo id={id} size={24} />
                        <span className="text-label font-medium text-fg-2">{toolLabel(id)}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
          <div className="site-reveal mx-auto w-full max-w-[340px] lg:sticky lg:top-28 lg:max-w-[460px]">
            <LogoSphere tools={ALL_TOOLS} size={40} />
            <p className="mt-2 text-center font-mono text-meta tracking-normal text-muted">
              {nb('Faites tourner : les outils, et Leon au milieu')}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="recit-fin" className="py-20 sm:py-28">
      <Container>
        <Tilt max={3} glare className="site-reveal rounded-panel">
          <div className="fx-ring signal-line relative overflow-hidden rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] px-6 py-16 shadow-panel backdrop-blur-[30px] sm:px-14 sm:py-24">
            <div aria-hidden="true" className="site-halo pointer-events-none absolute inset-0" />
            <div
              aria-hidden="true"
              className="site-grid pointer-events-none absolute inset-0 opacity-50"
            />
            <div className="relative grid grid-cols-[minmax(0,1fr)] items-end gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
              <div>
                <span className="relative inline-grid">
                  <span
                    aria-hidden="true"
                    className="fx-breathe absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,var(--accent-soft),transparent)]"
                  />
                  <Logo className="relative size-10 text-[19px]" />
                </span>
                <h2
                  id="recit-fin"
                  className="recit-display mt-8 text-[clamp(44px,7vw,96px)] leading-[0.98] text-balance text-fg"
                >
                  Ce qui a été dit <em className="recit-hl recit-hl-scroll">reste dit</em>.
                </h2>
              </div>
              <div className="lg:pb-3">
                <p className="text-[17px] leading-[1.65] text-fg-2">
                  {nb(
                    'Créez l’espace de votre équipe, branchez un premier outil, posez une première question.',
                  )}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <CtaLink href="/inscription">Créer un espace</CtaLink>
                  <CtaLink href="/connexion" variant="secondary">
                    Se connecter
                  </CtaLink>
                </div>
              </div>
            </div>
          </div>
        </Tilt>
      </Container>
    </section>
  );
}

/** Maquette 3 « Récit » de l'accueil. */
export function HomeRecit() {
  return (
    <div className={cn('recit', fraunces.variable)}>
      <Hero />
      <Journee />
      <Inconnu />
      <Franc />
      <Index />
      <Closing />
    </div>
  );
}
