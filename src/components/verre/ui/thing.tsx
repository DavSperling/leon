import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Children, type ComponentProps, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { type FlagTone, toneOf } from './marks';

type ThingOwnProps = {
  /** card (88 px) : ce que la personne a, ou regarde d'abord. tile (52 px) : ce qu'on ajoute ou choisit. */
  size?: 'card' | 'tile';
  /** L'image : `<ToolLogo>`, `<Avatar>`, l'icône d'un fichier. 36 px dans une carte, 28 dans une tuile. */
  picture?: ReactNode;
  /** Ce que c'est, en un nom. */
  name: ReactNode;
  /** Une légende discrète, au plus : « Équipe », « Vous seul », un métier. Ni compteur, ni date, ni taille. */
  caption?: ReactNode;
  /** Quelque chose ne va pas : la légende passe au rouge, un point rouge se pose sur l'image. */
  error?: boolean;
  /** La chose travaille (« Lecture… ») : le surligneur passe une fois sous la légende. */
  working?: boolean;
  /** Les mots d'une pastille de 28 px à la place du chevron (« Connecter »). Ce n'est pas un second bouton. */
  pill?: ReactNode;
  /** La pastille en encre pleine (« Reconnecter ») : elle compte pour la pastille d'encre de la vue. */
  pillInk?: boolean;
  /** Le numéro d'une source, dans sa couleur, avant l'image. */
  num?: number;
  /** La couleur du trait qui passe sous le nom quand on le pointe (celle de `num` par défaut, sinon ambre). */
  hl?: FlagTone;
  /** Le nom se lit entier, sur deux lignes au besoin (une question à essayer). */
  wrap?: boolean;
  /** false : sans chevron (une chose qui ne s'ouvre pas ailleurs). */
  chevron?: boolean;
  /** Nom accessible quand le nom seul ne dit pas l'action : « Gérer Gmail ». */
  label?: string;
  className?: string;
};

export type ThingProps = ThingOwnProps &
  (
    | ({ href: string } & Omit<ComponentProps<typeof Link>, 'href' | 'children' | 'className'>)
    | ({ href?: undefined } & Omit<ComponentProps<'button'>, 'children' | 'className' | 'name'>)
  );

/**
 * Une chose sur le bureau (un outil, un document, une personne, un ordinateur, une question) : un rectangle, et tout
 * le rectangle est le contrôle. Un lien avec `href`, sinon un bouton. Jamais de bouton à l'intérieur ; tout le reste
 * de la chose vit dans son panneau (`SidePanel`).
 */
export function Thing({
  size = 'tile',
  picture,
  name,
  caption,
  error,
  working,
  pill,
  pillInk,
  num,
  hl,
  wrap,
  chevron = true,
  label,
  className,
  ...props
}: ThingProps) {
  const tone = hl ?? (num == null ? undefined : toneOf(num));
  const cls = cn(
    'tl',
    size,
    tone && `hl-${tone}`,
    error && 'is-err',
    wrap && 'tl--wrap',
    className,
  );
  const inner = (
    <>
      {num != null && <span className={`num c${toneOf(num)}`}>{num}</span>}
      {picture && (
        <span className="tl__pic">
          {picture}
          {error && <span className="tl__dot" />}
        </span>
      )}
      <span className="tl__id">
        <span className="tl__name" title={typeof name === 'string' && !wrap ? name : undefined}>
          <span className="mark">{name}</span>
        </span>
        {caption != null && caption !== false && (
          <span className="tl__sub">
            {working ? <span className="mark is-working">{caption}</span> : caption}
          </span>
        )}
      </span>
      {pill != null && pill !== false ? (
        <span className={cn('tl__pill', pillInk && 'tl__pill--ink')}>{pill}</span>
      ) : (
        chevron && <ChevronRight aria-hidden="true" strokeWidth={1.6} className="tl__chev" />
      )}
    </>
  );
  if (props.href !== undefined)
    return (
      <Link className={cls} aria-label={label} aria-busy={working || undefined} {...props}>
        {inner}
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-busy={working || undefined}
      {...(props as ComponentProps<'button'>)}
    >
      {inner}
    </button>
  );
}

export type ThingGridProps = Omit<ComponentProps<'ul'>, 'children'> & {
  /** 3 : trois colonnes au plus (documents, sources, questions). Sinon quatre à 1512 px. */
  cols?: 3;
  /** Des `<Thing>` : chacun est posé dans son `<li>`. */
  children: ReactNode;
};

/** La grille des choses : mêmes colonnes pour les cartes et les tuiles, 12 px entre elles, une colonne au téléphone. */
export function ThingGrid({ cols, className, children, ...props }: ThingGridProps) {
  return (
    <ul className={cn('things', cols === 3 && 'things-3', className)} {...props}>
      {Children.toArray(children).map((child, i) => (
        <li key={isValidElement(child) && child.key != null ? child.key : i}>{child}</li>
      ))}
    </ul>
  );
}
