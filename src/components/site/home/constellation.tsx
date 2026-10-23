import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  KeyRound,
  MessagesSquare,
  PenLine,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { ALL_TOOLS, BRIEFING, DEMOS, type Demo, SYNTAX, TEAMS, TOOL_COUNT } from '../content';
import { DemoAnswerCard, DemoSourceRow } from '../demo-card';
import {
  ArrowLink,
  CitedAnswer,
  Container,
  CtaBand,
  CtaLink,
  Kicker,
  LogoMarquee,
  QueryCode,
  SectionHeading,
  ToolLogo,
} from '../parts';
import { ConstellationDiagram } from './constellation/diagram';
import './constellation.css';

// Maquette 2 « Constellation » : le haut de page en deux colonnes, avec le schéma vivant des outils qui convergent vers
// Leon ; puis une grille de tuiles (chaque fonction avec son petit visuel), les équipes, le grand énoncé « La source, ou
// rien. », les outils qui défilent, et l'appel final. Données fictives (ACME, Julie…) montrées comme telles.

const PROMISE = DEMOS[0] as Demo;
const UNKNOWN = DEMOS[3] as Demo;
const HANDOVER = DEMOS[2] as Demo;

// ---------- Haut de page ----------

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-10 sm:pt-36 lg:pb-16">
      <div
        aria-hidden="true"
        className="site-dots pointer-events-none absolute inset-0 opacity-70"
      />
      <Container className="relative grid items-center gap-y-12 gap-x-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)]">
        <div className="max-w-[620px]">
          <div className="site-rise" style={{ '--i': 0 } as CSSProperties}>
            <Kicker>Mémoire d’entreprise, pour les PME</Kicker>
          </div>
          <h1
            className="site-rise mt-5 text-[clamp(40px,5.4vw,70px)] leading-[0.99] font-bold tracking-[-0.05em] text-balance text-fg"
            style={{ '--i': 1 } as CSSProperties}
          >
            {nb('La mémoire de votre entreprise ')}
            <span className="site-gradient site-gradient-anim">
              {nb('se remplit toute seule.')}
            </span>
          </h1>
          <p
            className="site-rise mt-6 max-w-[540px] text-[18px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[16px]"
            style={{ '--i': 2 } as CSSProperties}
          >
            {nb(
              'Leon se branche sur vos outils et sur les conversations avec vos assistants d’IA. Il garde tout tel quel, avec les droits de chacun, et le retrouve avec sa source.',
            )}
          </p>
          <div
            className="site-rise mt-9 flex flex-wrap items-center gap-3"
            style={{ '--i': 3 } as CSSProperties}
          >
            <CtaLink href="/inscription">Créer un espace</CtaLink>
            <CtaLink href="/cas-usage" variant="secondary">
              Voir les cas d’usage
            </CtaLink>
          </div>
        </div>
        <div className="site-rise relative" style={{ '--i': 2 } as CSSProperties}>
          <ConstellationDiagram className="max-lg:max-w-[520px]" />
        </div>
      </Container>
    </section>
  );
}

const FACTS = [
  { value: String(TOOL_COUNT), text: 'outils branchables, par une clé ou un bouton de connexion' },
  { value: '15 min', text: 'entre deux relèves, sans rien ressaisir' },
  { value: '[n]', text: 'un renvoi par affirmation, ou « je ne sais pas »' },
  { value: '250 mots', text: 'au plus pour le point du matin' },
] as const;

function Facts() {
  return (
    <Container className="pb-10">
      <dl className="site-reveal grid overflow-hidden rounded-box border border-line bg-panel shadow-hi backdrop-blur-[20px] sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((f, i) => (
          <div
            key={f.value}
            className={cn(
              'flex flex-col gap-2 px-6 py-6',
              i > 0 &&
                'border-line max-sm:border-t sm:max-lg:[&:nth-child(n+3)]:border-t lg:border-l',
              i === 1 && 'sm:max-lg:border-l',
              i === 3 && 'sm:max-lg:border-l',
            )}
          >
            <dt className="text-label leading-[1.45] text-muted">{nb(f.text)}</dt>
            <dd className="order-first font-mono text-[30px] leading-none font-medium tracking-[-0.03em] text-fg">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </Container>
  );
}

// ---------- Tuiles ----------

function Tile({
  title,
  text,
  className,
  children,
  visualClassName,
}: {
  title: string;
  text: string;
  className?: string;
  children: ReactNode;
  visualClassName?: string;
}) {
  return (
    <GlassCard
      spotlight
      className={cn('site-reveal flex flex-col rounded-box p-5 sm:p-6', className)}
    >
      <div
        aria-hidden="true"
        className={cn(
          'relative mb-6 grid flex-1 place-items-center overflow-hidden rounded-[14px] border border-line bg-glass-3 p-2.5 sm:p-3',
          visualClassName,
        )}
      >
        <span className="site-dots pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative w-full">{children}</div>
      </div>
      <h3 className="text-title font-semibold tracking-[-0.015em] text-fg">{nb(title)}</h3>
      <p className="mt-1.5 text-body leading-[1.6] text-muted">{nb(text)}</p>
    </GlassCard>
  );
}

function AnswerVisual() {
  return (
    <div className="grid gap-2.5">
      <DemoAnswerCard demo={PROMISE} className="bg-glass-2">
        <CitedAnswer
          text={PROMISE.answer}
          className="relative z-[1] mt-3 text-[14.5px] leading-[1.7] text-fg"
        />
      </DemoAnswerCard>
      <ul className="flex flex-wrap gap-2">
        {PROMISE.sources.map((s, i) => (
          <li
            key={s.title}
            className="flex items-center gap-2 rounded-full border border-line bg-glass-3 py-1 pr-3 pl-1"
          >
            <ToolLogo id={s.tool} size={22} />
            <span className="font-mono text-[11px] text-accent">[{i + 1}]</span>
            <span className="text-label text-fg-2">{s.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiltersVisual() {
  return (
    <ul className="grid gap-2">
      {SYNTAX.map((s) => (
        <li
          key={s.code}
          className="grid gap-1.5 rounded-field border border-line bg-glass-3 px-3 py-2.5"
        >
          <span>
            <QueryCode q={s.code} />
          </span>
          <span className="text-label leading-[1.45] text-fg-2">{nb(s.text)}</span>
        </li>
      ))}
    </ul>
  );
}

function BriefingVisual() {
  return (
    <div className="rounded-field border border-line bg-glass-3 p-3.5">
      <p className="flex items-center justify-between font-mono text-meta tracking-normal text-muted">
        <span>point du matin</span>
        <span>08:45</span>
      </p>
      <ol className="mt-3 grid gap-2.5">
        {BRIEFING.map((part, i) => (
          <li key={part.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
            <span className="mt-[3px] grid size-4 place-items-center rounded-full bg-accent-soft font-mono text-[9.5px] text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-label font-semibold text-fg">{nb(part.title)}</span>
              <span className="block truncate text-label text-muted">{nb(part.items[0])}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RawVisual() {
  const source = HANDOVER.sources[2] ?? HANDOVER.sources[0];
  if (!source) return null;
  return (
    <div className="grid gap-2.5">
      <ol>
        <DemoSourceRow source={source} n={3} />
      </ol>
      <div className="flex items-center justify-between gap-2 rounded-field border border-dashed border-line-strong px-3 py-2">
        <span className="font-mono text-meta tracking-normal text-muted">gardé tel quel</span>
        <span className="inline-flex items-center gap-1 text-label font-semibold text-accent">
          Ouvrir dans Notion
          <ArrowUpRight strokeWidth={2} className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function PrivateVisual() {
  const team = [
    { tool: 'linear', label: 'Tickets' },
    { tool: 'notion', label: 'Pages' },
    { tool: 'granola', label: 'Réunions' },
  ] as const;
  const mine = [
    { icon: Globe, label: 'Conversations d’IA' },
    { icon: MessagesSquare, label: 'Discussions' },
    { icon: PenLine, label: 'Notes' },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-field border border-line bg-glass-3 p-2.5">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-normal text-muted">
          <Users strokeWidth={1.8} className="size-3" />
          toute l’équipe
        </p>
        <ul className="mt-2.5 grid gap-1.5">
          {team.map((t) => (
            <li key={t.tool} className="flex items-center gap-2 text-label text-fg-2">
              <ToolLogo id={t.tool} size={20} />
              {t.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-field border border-accent-line bg-accent-soft p-2.5">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-normal text-accent">
          <KeyRound strokeWidth={1.8} className="size-3" />
          vous seul
        </p>
        <ul className="mt-2.5 grid gap-1.5">
          {mine.map((m) => (
            <li key={m.label} className="flex items-center gap-2 text-label text-fg">
              <span className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-glass-2 text-accent">
                <m.icon strokeWidth={1.8} className="size-3" />
              </span>
              <span className="truncate">{nb(m.label)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const MCP_TOOLS = [
  { name: 'search', text: 'chercher dans la mémoire' },
  { name: 'fetch', text: 'lire une source en entier' },
  { name: 'briefing', text: 'le point du matin' },
  { name: 'remember', text: 'garder une note' },
] as const;

function McpVisual() {
  return (
    <div className="overflow-hidden rounded-field border border-line bg-glass-3 font-mono text-[12px] tracking-normal">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="ml-2 text-[10.5px] text-muted">mcp · leon</span>
      </div>
      <ul className="grid gap-1.5 px-3 py-2.5">
        {MCP_TOOLS.map((t) => (
          <li key={t.name} className="flex items-baseline gap-2">
            <span className="text-accent">{t.name}</span>
            <span className="truncate text-muted">{nb(t.text)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px]">
        <span className="text-fg-2">jeton personnel ••••3f9a</span>
        <span className="rounded-full bg-success-soft px-2 py-[1px] text-success shadow-[inset_0_0_0_1px_var(--success-line)]">
          révocable
        </span>
      </div>
    </div>
  );
}

function SecretsVisual() {
  const Masked = ({ plain }: { plain: string }) => (
    <span className="relative inline-grid">
      <span className="cs-secret-plain col-start-1 row-start-1 text-warning">{plain}</span>
      <span className="cs-secret-mask col-start-1 row-start-1 rounded-[4px] bg-accent-soft px-1 text-accent">
        [secret masqué]
      </span>
    </span>
  );
  return (
    <div className="relative overflow-hidden rounded-field border border-line bg-glass-3 font-mono text-[12px] leading-[1.9] tracking-normal">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[10.5px] text-muted">
        <span>.env</span>
        <span>avant stockage</span>
      </div>
      <div className="relative px-3 py-2.5">
        <span
          aria-hidden="true"
          className="cs-scanline pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,var(--accent-soft),transparent)]"
        />
        <p className="truncate text-muted">
          <span className="text-fg-2">APP_URL</span>=https://app.exemple.fr
        </p>
        <p className="truncate">
          <span className="text-fg-2">DB_PASSWORD</span>
          <span className="text-muted">=</span>
          <Masked plain="hunter2-prod" />
        </p>
        <p className="truncate">
          <span className="text-fg-2">STRIPE_KEY</span>
          <span className="text-muted">=</span>
          <Masked plain="sk_live_51Hx…" />
        </p>
      </div>
    </div>
  );
}

function Bento() {
  return (
    <section aria-labelledby="cs-fonctions" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="cs-fonctions"
          kicker="Ce que fait Leon"
          title="Un seul endroit où chercher. Une réponse qui cite."
          lead="Leon ne résume pas et ne tient pas de fiches. Il garde, il retrouve, il cite. Chaque tuile montre l’écran tel qu’il est, avec des données d’exemple."
        />
        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Tile
            className="md:col-span-2 lg:col-span-4"
            title="Une réponse en tête, chaque phrase citée"
            text="La réponse arrive au-dessus des résultats. Chaque renvoi ouvre la source qu’il cite : la réunion, la note, le ticket."
          >
            <AnswerVisual />
          </Tile>
          <Tile
            className="md:row-span-2 lg:col-span-2"
            title="Les filtres s’écrivent dans la barre"
            text="Rien à déplier : on tape ce qu’on cherche, de qui, d’où, depuis quand."
          >
            <FiltersVisual />
          </Tile>
          <Tile
            className="lg:col-span-2"
            title="Le point du matin"
            text="Ce que vous avez fait, ce qui a bougé, ce qui reste ouvert. 250 mots au plus, prêts au démarrage."
          >
            <BriefingVisual />
          </Tile>
          <Tile
            className="lg:col-span-2"
            title="Le brut, tel quel"
            text="Aucun résumé, aucune fiche à tenir. Chaque élément est gardé tel qu’il a été écrit, avec un lien vers l’original."
          >
            <RawVisual />
          </Tile>
          <Tile
            className="lg:col-span-2"
            title="Vos conversations restent les vôtres"
            text="Ce que lit une connexion est visible de l’équipe. Vos conversations d’IA, vos discussions et vos notes ne sont visibles que de vous."
          >
            <PrivateVisual />
          </Tile>
          <Tile
            className="lg:col-span-2"
            title="Dans votre assistant, par MCP"
            text="Votre assistant d’IA interroge Leon avec vos droits, rien de plus. Un jeton personnel, révocable à tout moment."
          >
            <McpVisual />
          </Tile>
          <Tile
            className="md:col-span-2 lg:col-span-2"
            title="Les secrets masqués avant stockage"
            text="Clés d’API, jetons, lignes de .env : masqués avant d’être gardés. Un mot de passe écrit en toutes lettres peut passer ; nous préférons le dire."
          >
            <SecretsVisual />
          </Tile>
        </div>
      </Container>
    </section>
  );
}

// ---------- Équipes ----------

function Teams() {
  return (
    <section aria-labelledby="cs-equipes" className="relative pt-6 pb-20 sm:pt-8 sm:pb-24">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            id="cs-equipes"
            kicker="Par équipe"
            title="Chaque équipe y cherche ce qui la concerne."
          />
          <ArrowLink href="/cas-usage" className="site-reveal mb-1">
            Tous les cas d’usage
          </ArrowLink>
        </div>
        <ul className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEAMS.map((t) => (
            <li key={t.slug} className="site-reveal">
              <Link
                href={`/cas-usage/${t.slug}`}
                className="site-lift group flex h-full flex-col rounded-box border border-line bg-panel p-5 shadow-hi backdrop-blur-[16px]"
              >
                <span className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-item border border-line bg-glass-3 text-accent transition-colors duration-300 group-hover:border-accent-line group-hover:bg-accent-soft">
                    <t.icon aria-hidden="true" strokeWidth={1.7} className="size-5" />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    strokeWidth={2}
                    className="size-4 -translate-x-1 text-accent opacity-0 transition-[translate,opacity] duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </span>
                <span className="mt-5 text-title font-semibold tracking-[-0.015em] text-fg">
                  {t.label}
                </span>
                <span className="mt-1.5 flex-1 text-body leading-[1.55] text-muted">
                  {nb(t.pitch)}
                </span>
                <span aria-hidden="true" className="mt-5 flex items-center">
                  {t.tools.slice(0, 4).map((id, i) => (
                    <ToolLogo
                      key={id}
                      id={id}
                      size={28}
                      className={cn(i > 0 && '-ml-1.5', 'ring-2 ring-[var(--bg)]')}
                    />
                  ))}
                  {t.tools.length > 4 && (
                    <span className="ml-2 font-mono text-meta tracking-normal text-muted">
                      +{t.tools.length - 4}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ---------- « La source, ou rien. » ----------

function Statement() {
  const words = ['La', 'source,', 'ou', 'rien.'];
  const first = UNKNOWN.sources[0];
  return (
    <section aria-labelledby="cs-source" className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute inset-x-0 top-[8%] h-[70%] [mask:linear-gradient(180deg,transparent,#000_35%,#000_60%,transparent)]"
      />
      <Container className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <Kicker>Franc</Kicker>
          <h2
            id="cs-source"
            className="mt-4 text-[clamp(52px,9vw,128px)] leading-[0.92] font-extrabold tracking-[-0.06em] text-fg"
          >
            {words.map((w, i) => (
              <span
                key={w}
                className={cn('cs-statement-word inline-block', i === 1 && 'site-gradient')}
              >
                {nb(w)}
                {i < words.length - 1 && ' '}
              </span>
            ))}
          </h2>
          <p className="site-reveal mt-8 max-w-[520px] text-[17px] leading-[1.65] text-fg-2">
            {nb(
              'Leon ne devine pas. Chaque phrase d’une réponse renvoie à l’endroit où elle a été écrite ou dite. Quand aucune source ne répond, la réponse est « je ne sais pas », pas une supposition.',
            )}
          </p>
        </div>
        <figure className="site-reveal grid gap-3">
          <div className="rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-3 shadow-panel backdrop-blur-[30px] sm:p-4">
            <div className="flex h-[52px] items-center gap-3 rounded-box border border-line-strong bg-glass-2 px-4 text-[15px] font-medium text-fg shadow-hi">
              <span className="truncate">{nb(UNKNOWN.query)}</span>
            </div>
            <DemoAnswerCard demo={UNKNOWN} className="mt-3" />
            {first && (
              <ol className="mt-3">
                <DemoSourceRow source={first} n={1} />
              </ol>
            )}
          </div>
          <figcaption className="px-1 font-mono text-meta tracking-normal text-muted">
            Exemple fictif · quand rien ne répond, Leon le dit
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}

// ---------- Outils ----------

function Tools() {
  const half = Math.ceil(ALL_TOOLS.length / 2);
  return (
    <section aria-labelledby="cs-outils" className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          id="cs-outils"
          align="center"
          kicker="Connecteurs"
          title={`${TOOL_COUNT} outils, et vos assistants d’IA`}
          lead="Dev, réunions, projet, CRM, support, mails : Leon relève ce qui change toutes les 15 minutes, par une clé d’API ou un bouton de connexion."
        />
      </Container>
      <div className="site-reveal mt-12 grid gap-4">
        <LogoMarquee tools={ALL_TOOLS.slice(0, half)} duration={70} />
        <LogoMarquee tools={ALL_TOOLS.slice(half)} duration={80} reverse />
      </div>
      <div className="mt-10 flex justify-center">
        <ArrowLink href="/connecteurs">Voir les {TOOL_COUNT} connecteurs</ArrowLink>
      </div>
    </section>
  );
}

export function HomeConstellation() {
  return (
    <>
      <Hero />
      <Facts />
      <Bento />
      <Teams />
      <Statement />
      <Tools />
      <CtaBand
        title="Votre mémoire d’entreprise commence au premier outil branché."
        text="Créez un espace, branchez un outil, posez une question. La réponse arrive avec sa source."
      />
    </>
  );
}
