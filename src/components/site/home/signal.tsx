import {
  ArrowRight,
  CircleHelp,
  FileText,
  MessagesSquare,
  Quote,
  ShieldCheck,
  Terminal,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import {
  ALL_TOOLS,
  BRIEFING,
  DEMOS,
  type Demo,
  FAQ,
  SECURITY_FACTS,
  TAGLINES,
  TOOL_COUNT,
} from '../content';
import {
  ArrowLink,
  Cite,
  Container,
  CtaBand,
  CtaLink,
  Excerpt,
  Kicker,
  LogoMarquee,
  QueryCode,
  SectionHeading,
  ToolLogo,
} from '../parts';
import { TeamTabs } from '../team-tabs';
import { HeroDemo } from './hero-demo';
import './signal.css';

// Maquette 1 « Signal » : la plus proche de l'appli. Un titre centré, puis la démo de la recherche (requête, faisceau,
// sources, réponse citée) comme point focal ; ensuite le problème, les trois temps, les équipes en onglets, la preuve
// (« La source, ou rien. »), l'assistant d'IA, la sécurité et les questions fréquentes.

const rise = (i: number) => ({ '--i': i }) as CSSProperties;

function Hero() {
  return (
    <section aria-labelledby="titre" className="relative overflow-hidden pt-32 pb-10 sm:pt-40">
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute inset-x-0 top-0 h-[760px]"
      />
      <div
        aria-hidden="true"
        className="site-grid pointer-events-none absolute inset-x-0 top-0 h-[820px] opacity-80"
      />
      <Container className="relative">
        <div className="mx-auto max-w-[960px] text-center">
          <Link
            href="/produit"
            style={rise(0)}
            className="site-rise group inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-glass-2 py-1 pr-3.5 pl-1 text-label font-medium text-fg-2 backdrop-blur-[14px] transition-colors duration-200 hover:border-accent-line hover:text-fg"
          >
            <span className="rounded-full bg-accent-soft px-2.5 py-[3px] font-mono text-[11px] tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
              Bêta
            </span>
            {nb('La mémoire d’entreprise des PME')}
            <ArrowRight
              aria-hidden="true"
              strokeWidth={2}
              className="size-3.5 text-accent transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </Link>
          <h1
            id="titre"
            style={rise(1)}
            className="site-rise mt-7 text-[clamp(40px,7.2vw,86px)] leading-[0.98] font-extrabold tracking-[-0.052em] text-balance text-fg"
          >
            {nb('Ce qui a été promis à vos clients, ')}
            <span className="site-gradient site-gradient-anim">
              {nb('retrouvé avec sa source.')}
            </span>
          </h1>
          <p
            style={rise(2)}
            className="site-rise mx-auto mt-6 max-w-[660px] text-[18px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[16px]"
          >
            {nb(
              'Leon se branche sur vos outils et sur les conversations avec vos assistants d’IA. Il garde tout tel quel, avec les droits de chacun, et répond en citant la source. Quand rien ne répond, il le dit.',
            )}
          </p>
          <div
            style={rise(3)}
            className="site-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <CtaLink href="/inscription">Créer un espace</CtaLink>
            <CtaLink href="/produit" variant="secondary">
              Voir comment ça marche
            </CtaLink>
          </div>
          <p
            style={rise(4)}
            className="site-rise mt-5 font-mono text-meta tracking-normal text-muted"
          >
            Pilote gratuit de 30 jours · sans carte bancaire
          </p>
        </div>
        <div style={rise(5)} className="site-rise mx-auto mt-14 max-w-[1100px] sm:mt-16">
          <HeroDemo />
        </div>
      </Container>
    </section>
  );
}

function ToolsStrip() {
  const half = Math.ceil(ALL_TOOLS.length / 2);
  return (
    <section aria-labelledby="outils-titre" className="py-14 sm:py-20">
      <Container>
        <h2
          id="outils-titre"
          className="text-center font-mono text-meta tracking-normal text-muted"
        >
          {nb(`Se branche sur ${TOOL_COUNT} outils de l’équipe, et sur vos assistants d’IA`)}
        </h2>
      </Container>
      <LogoMarquee tools={ALL_TOOLS.slice(0, half)} className="mt-7" duration={56} />
      <LogoMarquee tools={ALL_TOOLS.slice(half)} reverse className="mt-3" duration={62} />
    </section>
  );
}

const PROBLEMS = [
  {
    title: 'Tout est quelque part',
    text: 'Mails, CRM, tickets, réunions, pages : ce qui a été dit vit dans des dizaines d’outils. Le retrouver prend une matinée, quand on le retrouve.',
  },
  {
    title: 'Les départs emportent la mémoire',
    text: 'Quand un chef de projet part, ses engagements partent avec lui. Le client, lui, s’en souvient.',
  },
  {
    title: 'Chacun parle à son IA dans son coin',
    text: 'Les conversations avec les assistants d’IA contiennent des décisions. Elles ne servent qu’à une personne, puis se perdent.',
  },
] as const;

// Logos épars (outil, gauche %, haut %, rotation) : l'information dispersée.
const SCATTER: Array<[ProviderId, number, number, number]> = [
  ['outlook', 2, 8, -8],
  ['hubspot', 24, 52, 6],
  ['linear', 44, 4, -4],
  ['granola', 62, 50, 9],
  ['notion', 82, 12, -6],
  ['zendesk', 10, 68, 4],
  ['asana', 72, 74, -10],
];

function ProblemVisual({ i }: { i: number }) {
  if (i === 0)
    return (
      <div aria-hidden="true" className="relative h-[132px]">
        {SCATTER.map(([id, x, y, r]) => (
          <span
            key={id}
            className="sig-bob absolute"
            style={{ left: `${x}%`, top: `${y}%`, rotate: `${r}deg` } as CSSProperties}
          >
            <ToolLogo id={id} size={34} />
          </span>
        ))}
      </div>
    );
  if (i === 1)
    return (
      <div aria-hidden="true" className="grid h-[132px] content-center gap-2">
        {[
          'Relancer le devis Verlant',
          'Livrer la V2 à ACME le 15 nov.',
          'Reprendre les données',
        ].map((task, k) => (
          <div
            key={task}
            className="flex items-center gap-2.5 rounded-field border border-line bg-glass-3 px-3 py-2 text-label text-fg-2"
            style={{ opacity: 1 - k * 0.28 }}
          >
            <span className="size-3.5 rounded-full border border-line-strong" />
            <span className="truncate">{nb(task)}</span>
            <span className="ml-auto font-mono text-[10.5px] text-muted">Thomas</span>
          </div>
        ))}
      </div>
    );
  return (
    <div aria-hidden="true" className="grid h-[132px] content-center gap-2">
      <div className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[4px] bg-accent-soft px-3 py-2 text-label text-fg shadow-[inset_0_0_0_1px_var(--accent-line)]">
        {nb('On garde Postgres pour la file, pas Redis ?')}
      </div>
      <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] border border-line bg-glass-3 px-3 py-2 text-label text-fg-2">
        {nb('Oui : une seule base, moins de pièces à surveiller…')}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-normal text-muted">
        <MessagesSquare strokeWidth={1.7} className="size-3" />
        conversation d’une seule personne
      </div>
    </div>
  );
}

function Problem() {
  return (
    <section aria-labelledby="probleme" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="probleme"
          kicker="Le problème"
          title="L’information de l’équipe est partout, sauf là où on la cherche."
          align="center"
        />
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <li
              key={p.title}
              className="site-reveal site-lift relative overflow-hidden rounded-box border border-line bg-panel p-6 shadow-hi"
            >
              <ProblemVisual i={i} />
              <h3 className="mt-5 text-title font-semibold tracking-[-0.015em] text-fg">
                {nb(p.title)}
              </h3>
              <p className="mt-2 text-body leading-[1.6] text-muted">{nb(p.text)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Steps() {
  return (
    <section aria-labelledby="etapes" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="etapes"
          kicker="Comment ça marche"
          title="Vous branchez. Leon garde. Vous demandez."
          lead="Aucune fiche à remplir, aucun résumé à relire : Leon relève vos outils toutes les 15 minutes et garde chaque élément tel qu’il a été écrit."
        />
        <ol className="relative mt-14 grid gap-4 lg:grid-cols-3">
          {/* fil qui relie les trois temps */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute top-[30px] right-[16%] left-[16%] h-2 max-lg:hidden"
            preserveAspectRatio="none"
            viewBox="0 0 100 2"
          >
            <line
              x1="0"
              y1="1"
              x2="100"
              y2="1"
              stroke="var(--accent-line)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className="site-flow"
            />
          </svg>

          <li className="site-reveal relative rounded-box border border-line bg-panel p-6 shadow-hi">
            <StepNumber n="01" />
            <h3 className="mt-5 text-title font-semibold text-fg">Vous branchez vos outils</h3>
            <p className="mt-2 text-body leading-[1.6] text-muted">
              {nb(
                `Une clé d’API ou un bouton de connexion, parmi ${TOOL_COUNT} outils. L’extension du navigateur et votre assistant de code ajoutent vos conversations d’IA.`,
              )}
            </p>
            <div aria-hidden="true" className="mt-5 grid gap-2">
              <div className="grid grid-cols-6 gap-2">
                {(['github', 'notion', 'hubspot', 'linear', 'granola', 'intercom'] as const).map(
                  (id) => (
                    <ToolLogo key={id} id={id} size={34} />
                  ),
                )}
              </div>
              <div className="flex items-center gap-3 rounded-field border border-line bg-glass-3 px-3 py-2.5 text-label text-fg-2">
                <span className="size-2 rounded-full bg-ok" />
                Extension · assistant web
                <span className="ml-auto inline-flex h-5 w-9 items-center rounded-full bg-accent p-0.5">
                  <span className="ml-auto size-4 rounded-full bg-accent-ink" />
                </span>
              </div>
            </div>
          </li>

          <li className="site-reveal relative rounded-box border border-line bg-panel p-6 shadow-hi">
            <StepNumber n="02" />
            <h3 className="mt-5 text-title font-semibold text-fg">Leon garde le brut</h3>
            <p className="mt-2 text-body leading-[1.6] text-muted">
              {nb(
                'Tel quel, avec un lien vers l’original et les droits de chacun. Les secrets reconnaissables sont masqués avant d’être gardés.',
              )}
            </p>
            <div aria-hidden="true" className="mt-5 grid gap-2">
              <div className="rounded-field border border-line bg-glass-3 px-3 py-2.5">
                <div className="flex items-center gap-2 text-label font-semibold text-fg">
                  <ToolLogo id="granola" size={20} />
                  Point mensuel ACME
                  <span className="ml-auto font-mono text-[10.5px] font-normal text-muted">
                    3 oct.
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-label text-muted">
                  {nb('« On peut s’engager sur le 15 novembre pour la V2… »')}
                </p>
                <p className="mt-1.5 text-label font-semibold text-accent">Ouvrir dans Granola ↗</p>
              </div>
              <code className="block rounded-field border border-line bg-glass-3 px-3 py-2.5 font-mono text-[12px] text-fg-2">
                <span className="text-muted">DB_PASSWORD=</span>
                <span className="rounded-[4px] bg-mark-bg px-1 text-mark-ink">[masqué]</span>
              </code>
            </div>
          </li>

          <li className="site-reveal relative rounded-box border border-line bg-panel p-6 shadow-hi">
            <StepNumber n="03" />
            <h3 className="mt-5 text-title font-semibold text-fg">Vous demandez</h3>
            <p className="mt-2 text-body leading-[1.6] text-muted">
              {nb(
                'Une recherche, une discussion, ou votre assistant d’IA par MCP. La réponse cite chaque source, ou dit « je ne sais pas ».',
              )}
            </p>
            <div aria-hidden="true" className="mt-5 grid gap-2">
              <div className="flex h-10 items-center gap-2 rounded-field border border-line-strong bg-glass-2 px-3">
                <QueryCode q="de:julie type:réunion depuis:1m" />
              </div>
              <div className="signal-line relative overflow-hidden rounded-field border border-line bg-glass-2 px-3 py-2.5 text-label leading-[1.6] text-fg">
                {nb('Julie s’est engagée sur le 15 nov.')}
                <Cite n={1} />
                {nb(', hors reprise des données')}
                <Cite n={2} />.
              </div>
            </div>
          </li>
        </ol>
      </Container>
    </section>
  );
}

function StepNumber({ n }: { n: string }) {
  return (
    <span className="relative z-[1] inline-grid size-[44px] place-items-center rounded-full border border-accent-line bg-[color-mix(in_srgb,var(--bg)_70%,var(--accent-soft))] font-mono text-ui font-medium text-accent shadow-[0_0_0_6px_color-mix(in_srgb,var(--bg)_80%,transparent)]">
      {n}
    </span>
  );
}

function UseCases() {
  return (
    <section aria-labelledby="equipes" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="equipes"
          kicker="Cas d’usage"
          title="Une mémoire commune, des questions propres à chaque équipe."
          lead="Direction, ventes, support, produit, projets, arrivées : chacun cherche autre chose, dans les mêmes outils."
          align="center"
        />
        <div className="mt-12">
          <TeamTabs />
        </div>
      </Container>
    </section>
  );
}

const PROOFS = [
  {
    icon: Quote,
    title: 'Chaque phrase citée',
    text: 'Un renvoi par affirmation, vers la réunion, le ticket ou le mail d’origine.',
  },
  {
    icon: CircleHelp,
    title: '« Je ne sais pas », plutôt qu’une supposition',
    text: 'Quand aucune source ne répond, la réponse le dit. Rien n’est inventé pour combler.',
  },
  {
    icon: Users,
    title: 'Ce que vous avez le droit de voir',
    text: 'La recherche, la discussion et l’assistant passent par vos droits. Les conversations privées le restent.',
  },
  {
    icon: FileText,
    title: 'Le brut, jamais réécrit',
    text: 'Leon ne résume pas pour stocker. Il garde l’original et l’ouvre dans son outil.',
  },
] as const;

function Proof() {
  const unknown = DEMOS[3] as Demo;
  return (
    <section aria-labelledby="preuve" className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="site-reveal">
            <Kicker>Notre règle</Kicker>
            <h2
              id="preuve"
              className="mt-4 text-[clamp(44px,7vw,96px)] leading-[0.92] font-extrabold tracking-[-0.055em] text-fg"
            >
              {nb('La source,')}
              <br />
              <span className="site-gradient">ou rien.</span>
            </h2>
            <p className="mt-6 max-w-[480px] text-[17px] leading-[1.6] text-fg-2">
              {nb(
                'Une réponse sans source ne vaut rien devant un client qui conteste. Leon montre d’où vient chaque phrase, et s’arrête quand il ne sait pas.',
              )}
            </p>
            <div className="mt-8 max-w-[480px] rounded-box border border-warning-line bg-warning-soft p-4">
              <p className="font-mono text-meta tracking-normal text-warning">
                {nb(unknown.query)}
              </p>
              <p className="mt-2 text-body leading-[1.6] text-fg">
                <Excerpt text="**Je ne sais pas.** Aucune source gardée ne parle d’un tarif accordé à Verlant en 2024." />
              </p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROOFS.map((p) => (
              <li
                key={p.title}
                className="site-reveal site-lift rounded-box border border-line bg-panel p-6 shadow-hi"
              >
                <span className="grid size-10 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
                  <p.icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
                </span>
                <h3 className="mt-5 text-title font-semibold tracking-[-0.015em] text-fg">
                  {nb(p.title)}
                </h3>
                <p className="mt-2 text-body leading-[1.6] text-muted">{nb(p.text)}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function Assistant() {
  return (
    <section aria-labelledby="assistant" className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid gap-4 max-lg:order-2">
            <div className="site-reveal overflow-hidden rounded-box border border-line-strong bg-glass-2 shadow-panel">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 font-mono text-meta tracking-normal text-muted">
                <Terminal aria-hidden="true" strokeWidth={1.7} className="size-3.5" />
                assistant de code · serveur MCP de Leon
              </div>
              <div
                aria-hidden="true"
                className="grid gap-3 px-4 py-4 font-mono text-[12.5px] leading-[1.6] tracking-normal"
              >
                <p>
                  <span className="text-accent">›</span> <span className="text-fg">search</span>{' '}
                  <span className="text-muted">« reprise des données ACME »</span>
                </p>
                <p className="flex flex-wrap items-center gap-2 pl-4 text-fg-2">
                  3 sources
                  <ToolLogo id="linear" size={18} />
                  <ToolLogo id="hubspot" size={18} />
                  <ToolLogo id="granola" size={18} />
                </p>
                <p>
                  <span className="text-accent">›</span> <span className="text-fg">fetch</span>{' '}
                  <span className="text-muted">ticket ACME-214</span>
                </p>
                <p>
                  <span className="text-accent">›</span> <span className="text-fg">remember</span>{' '}
                  <span className="text-muted">« reprise reportée au 2 déc. »</span>
                </p>
                <p className="pl-4 text-success">note gardée, visible de vous seul</p>
              </div>
            </div>
            <div className="site-reveal signal-line relative overflow-hidden rounded-box border border-line bg-panel p-5 shadow-hi">
              <div className="flex items-center gap-2">
                <Logo className="size-[18px] text-[9.5px]" />
                <span className="text-[13px] font-semibold text-accent">Point du matin</span>
                <span className="ml-auto font-mono text-meta tracking-normal text-muted">
                  08:45 · 250 mots au plus
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {BRIEFING.map((part) => (
                  <div key={part.title}>
                    <h3 className="font-mono text-meta tracking-normal text-fg-2">
                      {nb(part.title)}
                    </h3>
                    <ul className="mt-2 grid gap-1.5">
                      {part.items.map((it) => (
                        <li key={it} className="text-label leading-[1.5] text-muted">
                          {nb(it)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <SectionHeading
              id="assistant"
              kicker="Dans votre assistant"
              title="Votre assistant d’IA connaît enfin le contexte de l’équipe."
              lead="Le serveur MCP de Leon donne à votre assistant quatre outils : chercher, lire une source, préparer le point du matin, garder une note. Avec un jeton personnel, révocable à tout moment, et vos droits, rien de plus."
            />
            <ul className="mt-8 grid gap-3 text-body text-fg-2">
              {[
                'Le point du matin vous attend au démarrage de votre assistant de code.',
                'Chaque session de code est gardée à sa fin, texte seul.',
                'Ce que lit chaque assistant est noté dans un journal.',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {nb(t)}
                </li>
              ))}
            </ul>
            <ArrowLink href="/produit#discute" className="mt-8">
              Discussions, point du matin et MCP
            </ArrowLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Security() {
  return (
    <section aria-labelledby="securite" className="py-20 sm:py-28">
      <Container>
        <div className="site-reveal relative overflow-hidden rounded-panel border border-line bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-6 shadow-panel backdrop-blur-[30px] sm:p-10">
          <div
            aria-hidden="true"
            className="site-dots pointer-events-none absolute inset-0 opacity-70"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[560px]">
              <Kicker>Sécurité</Kicker>
              <h2
                id="securite"
                className="mt-3 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-fg"
              >
                {nb('Chaque entreprise dans son espace. Chacun dans ses droits.')}
              </h2>
            </div>
            <ArrowLink href="/securite">Tout sur la sécurité</ArrowLink>
          </div>
          <ul className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY_FACTS.slice(0, 4).map((f) => (
              <li key={f.title} className="rounded-box border border-line bg-glass-3 p-5">
                <ShieldCheck aria-hidden="true" strokeWidth={1.7} className="size-5 text-accent" />
                <h3 className="mt-4 text-ui font-semibold text-fg">{nb(f.title)}</h3>
                <p className="mt-1.5 text-label leading-[1.55] text-muted">{nb(f.text)}</p>
              </li>
            ))}
          </ul>
          <p className="relative mt-6 text-label text-muted">
            {nb('Ce qui n’est pas encore là est écrit aussi : ')}
            <Link
              href="/securite#pas-encore"
              className="font-semibold text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              {nb('la liste')}
            </Link>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq" className="py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="site-reveal">
          <Kicker>Questions fréquentes</Kicker>
          <h2
            id="faq"
            className="mt-3 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-fg"
          >
            {nb('Ce qu’on nous demande d’abord.')}
          </h2>
          <ArrowLink href="/tarifs" className="mt-6">
            Tarifs et autres questions
          </ArrowLink>
        </div>
        <div className="grid gap-2">
          {FAQ.slice(0, 4).map((f) => (
            <details
              key={f.q}
              className="site-reveal group rounded-box border border-line bg-panel shadow-hi open:border-line-strong open:bg-glass-2"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-ui font-semibold text-fg [&::-webkit-details-marker]:hidden">
                {nb(f.q)}
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-accent transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-body leading-[1.65] text-muted">{nb(f.a)}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function HomeSignal() {
  return (
    <>
      <Hero />
      <ToolsStrip />
      <Problem />
      <Steps />
      <UseCases />
      <Proof />
      <Assistant />
      <Security />
      <Faq />
      <CtaBand
        title={TAGLINES.dit}
        text="Créez l’espace de votre équipe, branchez un premier outil, posez une première question."
      />
    </>
  );
}
