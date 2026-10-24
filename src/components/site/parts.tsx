import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { toolLabel } from './content';

// Briques du site public, rendues par le serveur (aucune ne demande JavaScript).

/** Colonne centrale du site : 1200 px au plus, marges de 20 px sur mobile. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)} {...props} />;
}

/** Logo d'un outil sur sa pastille blanche (les logos sombres restent lisibles en thème sombre), comme ToolIcon. */
export function ToolLogo({
  id,
  size = 40,
  className,
  title,
  lazy = true,
}: {
  id: ProviderId;
  size?: number;
  className?: string;
  /** Chargement différé (défaut) ; les bandeaux qui défilent chargent tout de suite. */
  lazy?: boolean;
  /** Libellé affiché au survol ; le logo reste décoratif pour les lecteurs d'écran. */
  title?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      title={title ? toolLabel(id) : undefined}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      className={cn(
        'grid shrink-0 place-items-center bg-[#fff] shadow-[0_0_0_1px_var(--line),0_6px_16px_-8px_rgba(0,0,0,.35)]',
        className,
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: petit SVG statique de public/logos */}
      <img
        src={`/logos/${id}.svg`}
        alt=""
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        loading={lazy ? 'lazy' : 'eager'}
      />
    </span>
  );
}

/** Bandeau de logos qui défile (deux copies, la seconde cachée aux lecteurs d'écran). S'arrête au survol. */
export function LogoMarquee({
  tools,
  reverse,
  duration = 48,
  size = 44,
  className,
}: {
  tools: ProviderId[];
  reverse?: boolean;
  duration?: number;
  size?: number;
  className?: string;
}) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-4 pr-4">
      {tools.map((id) => (
        <li
          key={id}
          className="flex items-center gap-3 rounded-full border border-line bg-glass-3 py-1.5 pr-4 pl-1.5"
        >
          <ToolLogo id={id} size={size - 12} lazy={false} />
          <span className="text-ui font-medium whitespace-nowrap text-fg-2">{toolLabel(id)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn('site-marquee overflow-hidden', className)}>
      <div
        className="site-marquee-track"
        data-reverse={reverse || undefined}
        style={{ '--marquee-dur': `${duration}s` } as CSSProperties}
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** Petit libellé au-dessus d'un titre : point d'accent, Geist Mono. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 font-mono text-meta font-medium tracking-[0.08em] text-accent uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
      {children}
    </p>
  );
}

/** Titre de section : libellé, h2, chapeau. */
export function SectionHeading({
  kicker,
  title,
  lead,
  align = 'left',
  className,
  id,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: string;
  align?: 'left' | 'center';
  className?: string;
  id?: string;
}) {
  return (
    <div
      className={cn(
        'site-reveal max-w-[720px]',
        align === 'center' && 'mx-auto text-center [&_p.kicker]:justify-center',
        className,
      )}
    >
      {kicker && <Kicker className="kicker">{kicker}</Kicker>}
      <h2
        id={id}
        className="mt-3 text-[clamp(28px,4vw,44px)] leading-[1.08] font-bold tracking-[-0.035em] text-balance text-fg"
      >
        {typeof title === 'string' ? nb(title) : title}
      </h2>
      {lead && (
        <p className="mt-4 text-[17px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[15.5px]">
          {nb(lead)}
        </p>
      )}
    </div>
  );
}

/** Requête comme dans la barre : la clé des filtres atténuée (`outil:`), la valeur et les guillemets en clair. */
export function QueryCode({ q, className }: { q: string; className?: string }) {
  return (
    <code
      className={cn(
        'inline-block max-w-full rounded-chip border border-line bg-glass-3 px-2 py-[3px] font-mono text-[12.5px] leading-[18px] tracking-normal break-words whitespace-pre-wrap text-fg',
        className,
      )}
    >
      {(q.match(/"[^"]*"?|\s+|[^\s"]+/g) ?? []).map((part, i) => {
        const m = /^(\p{L}+:)(.+)$/u.exec(part);
        return m ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'une requête figée, dans l'ordre
          <span key={i}>
            <span className="text-muted">{m[1]}</span>
            {m[2]}
          </span>
        ) : (
          part
        );
      })}
    </code>
  );
}

/** Une requête est-elle écrite en filtres (rendue en code) ou en langage courant ? */
export const isFilterQuery = (q: string): boolean => /(^|\s)\p{L}+:\S|^"/u.test(q);

/** Passage cité : les mots entre ** deviennent des <mark>, comme les surlignages de la recherche. */
export function Excerpt({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé
          <mark key={i}>{nb(part)}</mark>
        ) : (
          nb(part)
        ),
      )}
    </span>
  );
}

/** Puce de renvoi [n] (non interactive), comme CitationChip. */
export function Cite({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      data-active={active || undefined}
      className="relative mx-[1px] ml-1 inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-[5px] align-[2px] font-mono text-[11px] leading-none font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)] data-[active]:bg-accent data-[active]:text-accent-ink"
    >
      <span className="sr-only"> source </span>
      {n}
    </span>
  );
}

/** Réponse avec ses renvois « [n] » rendus en puces. */
export function CitedAnswer({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {text.split(/\[(\d+)\]/g).map((part, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé
          <Cite key={i} n={Number(part)} />
        ) : (
          nb(part)
        ),
      )}
    </p>
  );
}

/** Pastille « Réponse de Leon » : le logo, pas d'étincelles (brand.md proscrit l'icône). */
export function LeonMark({ label = 'Réponse de Leon' }: { label?: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold text-accent">
      <Logo className="size-[18px] text-[9.5px]" />
      {label}
    </span>
  );
}

/** Lien fléché discret (« Voir les connecteurs → »). */
export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex min-h-10 items-center gap-1.5 rounded-sm text-ui font-semibold text-accent',
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        strokeWidth={2}
        className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
      />
    </Link>
  );
}

/** Boutons du site : le principal (lueur d'accent) et le secondaire (verre), en lien. */
export function CtaLink({
  href,
  variant = 'primary',
  size = 'lg',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,filter,scale] duration-200 ease-out active:scale-[.97]',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-5 text-ui',
        variant === 'primary'
          ? 'site-cta bg-accent text-accent-ink hover:brightness-[1.06]'
          : 'border border-line-strong bg-glass-2 text-fg backdrop-blur-[12px] hover:border-accent-line hover:bg-hover',
        className,
      )}
    >
      {children}
      {variant === 'primary' && (
        <ArrowRight
          aria-hidden="true"
          strokeWidth={2.2}
          className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5"
        />
      )}
    </Link>
  );
}

/** Bandeau final : une phrase, le bouton principal, un lien secondaire. */
export function CtaBand({
  title,
  text,
  primary = { href: '/inscription', label: 'Créer un espace' },
  secondary = { href: '/connexion', label: 'Se connecter' },
}: {
  title: string;
  text?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="site-reveal fx-ring signal-line relative overflow-hidden rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] px-6 py-14 text-center shadow-panel backdrop-blur-[30px] sm:px-12 sm:py-20">
          <div aria-hidden="true" className="site-halo pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="site-grid pointer-events-none absolute inset-0 opacity-60"
          />
          <div className="relative">
            <Logo className="mx-auto size-11 text-[21px]" />
            <h2 className="mx-auto mt-6 max-w-[760px] text-[clamp(30px,4.6vw,52px)] leading-[1.05] font-bold tracking-[-0.04em] text-balance text-fg">
              {nb(title)}
            </h2>
            {text && (
              <p className="mx-auto mt-4 max-w-[560px] text-[17px] leading-[1.6] text-fg-2">
                {nb(text)}
              </p>
            )}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <CtaLink href={primary.href}>{primary.label}</CtaLink>
              <CtaLink href={secondary.href} variant="secondary">
                {secondary.label}
              </CtaLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
