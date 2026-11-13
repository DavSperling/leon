import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Demo, toolLabel } from './content';

// Briques du site public, rendues par le serveur (aucune ne demande JavaScript). Les formes sont dans site.css (s-…) ;
// le surligneur, le drapeau et les numéros viennent du kit de l'appli (kit.css : .hl, .flag, .num, .c1 à .c4).

/** La colonne du site : 1344 px au plus, marges 48 / 24 / 16. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('s-wrap', className)} {...props} />;
}

/** Le logo nu d'un outil (sur un petit carré blanc en sombre : les logos sont dessinés pour le clair). Décoratif. */
export function ToolLogo({
  id,
  size = 24,
  className,
  title,
  lazy = true,
}: {
  id: ProviderId;
  size?: number;
  className?: string;
  /** Chargement différé (défaut) ; les bandeaux qui défilent chargent tout de suite. */
  lazy?: boolean;
  /** Le nom de l'outil au survol ; le logo reste décoratif pour les lecteurs d'écran. */
  title?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      title={title ? toolLabel(id) : undefined}
      style={{ width: size, height: size }}
      className={cn('s-logo', className)}
    >
      {/* biome-ignore lint/performance/noImgElement: petit SVG statique de public/logos */}
      <img
        src={`/logos/${id}.svg`}
        alt=""
        width={size}
        height={size}
        loading={lazy ? 'lazy' : 'eager'}
      />
    </span>
  );
}

/** Quelques mots d'un titre sous un trait de surligneur, dans la couleur n (1 rose, 2 vert, 3 bleu, 4 ambre). */
export function Marked({ text, mark, tone = 1 }: { text: string; mark?: string; tone?: number }) {
  const at = mark ? text.indexOf(mark) : -1;
  if (!mark || at < 0) return <>{nb(text)}</>;
  return (
    <>
      {nb(text.slice(0, at))}
      <span className={cn('s-mark', `c${tone}`)}>{nb(mark)}</span>
      {nb(text.slice(at + mark.length))}
    </>
  );
}

/** Titre de section : un h2 (avec ses mots marqués) et, à côté ou dessous, son chapeau. */
export function SectionHeading({
  title,
  mark,
  tone,
  lead,
  className,
  id,
  side = true,
}: {
  title: string;
  mark?: string;
  tone?: number;
  lead?: ReactNode;
  className?: string;
  id?: string;
  /** Le chapeau à droite, colonnes 8 à 12 (défaut) ; sinon sous le titre. */
  side?: boolean;
}) {
  const h2 = (
    <h2 id={id} className="s-h2">
      <Marked text={title} mark={mark} tone={tone} />
    </h2>
  );
  const p = lead && (
    <p className={cn('s-lead', !side && 'mt-5 max-w-[36em]')}>
      {typeof lead === 'string' ? nb(lead) : lead}
    </p>
  );
  return side ? (
    <div className={cn('s-grid s-head s-rv', className)}>
      {h2}
      {p}
    </div>
  ) : (
    <div className={cn('s-rv', className)}>
      {h2}
      {p}
    </div>
  );
}

/** Requête comme dans la barre : la clé des filtres atténuée (`outil:`), la valeur et les guillemets en clair. */
export function QueryCode({ q, className }: { q: string; className?: string }) {
  return (
    <code
      className={cn(
        'inline-block max-w-full rounded-chip border border-line bg-glass-3 px-2 py-[3px] font-mono text-label leading-[18px] tracking-normal break-words whitespace-pre-wrap text-fg',
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

/** Passage cité : les mots entre ** passent sous le trait de la source (couleur portée par un parent .cN). */
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

/** Lien fléché, souligné à l'encre (« Voir les connecteurs → »). */
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
    <Link href={href} className={cn('s-more', className)}>
      <span>{children}</span>
      <ArrowRight aria-hidden="true" strokeWidth={1.8} className="size-4" />
    </Link>
  );
}

/** Les boutons du site : la pastille d'encre (une par vue, avec sa flèche) et la pastille au trait. */
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
        's-btn',
        variant === 'primary' ? 's-btn--ink' : 's-btn--line',
        size === 'md' && 's-btn--sm',
        className,
      )}
    >
      {children}
      {variant === 'primary' && (
        <ArrowRight aria-hidden="true" strokeWidth={1.8} className="size-4" />
      )}
    </Link>
  );
}

/** Le bandeau final, sur le bureau : la phrase (ses derniers mots marqués) à gauche, les deux pastilles à droite. */
export function CtaBand({
  title,
  mark,
  tone = 3,
  text,
  primary,
  secondary,
}: {
  title: string;
  mark?: string;
  tone?: number;
  text?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="s-band s-desk">
      <Container className="s-grid s-close s-rv">
        <div className="s-close__text">
          <h2 className="s-h2">
            <Marked text={title} mark={mark} tone={tone} />
          </h2>
          {text && <p className="s-lead mt-4">{nb(text)}</p>}
        </div>
        <CtaButtons className="s-close__cta" primary={primary} secondary={secondary} />
      </Container>
    </section>
  );
}

/** « Créer un espace » (encre) et « Se connecter » (au trait), côte à côte. */
export function CtaButtons({
  primary,
  secondary,
  className,
}: {
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  className?: string;
}) {
  const t = useTranslations('site.cta');
  return (
    <div className={className}>
      <CtaLink href={primary?.href ?? '/inscription'}>{primary?.label ?? t('create')}</CtaLink>
      <CtaLink href={secondary?.href ?? '/connexion'} variant="secondary">
        {secondary?.label ?? t('signIn')}
      </CtaLink>
    </div>
  );
}

/** Un index n en propriété CSS --i (délai d'une arrivée échelonnée). */
export const order = (i: number) => ({ '--i': i }) as CSSProperties;

/** La couleur d'une source : 1 rose, 2 vert, 3 bleu, 4 ambre, puis on recommence. */
export const tone = (n: number) => `c${((n - 1) % 4) + 1}`;

/** La démo `id`, ou la première. */
export const pick = (demos: Demo[], id: string): Demo =>
  demos.find((d) => d.id === id) ?? (demos[0] as Demo);
