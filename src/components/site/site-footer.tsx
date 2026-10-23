import Link from 'next/link';
import { Logo } from '@/components/verre/shell/brand';
import { nb } from '@/lib/verre/nb';
import { TAGLINES, TEAMS } from './content';
import { Container } from './parts';

const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { href: '/produit', label: 'Comment ça marche' },
      { href: '/produit#retrouve', label: 'Recherche et réponse citée' },
      { href: '/produit#discute', label: 'Discussions et point du matin' },
      { href: '/connecteurs', label: 'Connecteurs' },
      { href: '/tarifs', label: 'Tarifs' },
    ],
  },
  {
    title: 'Cas d’usage',
    links: TEAMS.map((t) => ({ href: `/cas-usage/${t.slug}`, label: t.label })),
  },
  {
    title: 'Confiance',
    links: [
      { href: '/securite', label: 'Sécurité' },
      { href: '/securite#pas-encore', label: 'Ce qui n’est pas encore là' },
    ],
  },
  {
    title: 'Compte',
    links: [
      { href: '/connexion', label: 'Se connecter' },
      { href: '/inscription', label: 'Créer un espace' },
    ],
  },
] as const;

/** Pied du site : la promesse, quatre colonnes de liens, le grand mot « Leon » en filigrane. */
export function SiteFooter() {
  return (
    <footer className="relative mt-10 overflow-hidden border-t border-line">
      <Container className="relative pt-16 pb-10">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div className="max-w-[340px]">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-2.5 rounded-full text-[17px] font-bold tracking-[-0.02em] text-fg"
            >
              <Logo className="size-7 text-[14px]" />
              Leon
            </Link>
            <p className="mt-4 text-body leading-[1.6] text-fg-2">{nb(TAGLINES.pitch)}</p>
          </div>
          <nav aria-label="Pied de page" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h2 className="font-mono text-meta font-medium tracking-[0.08em] text-muted uppercase">
                  {col.title}
                </h2>
                <ul className="mt-4 grid gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-flex items-center rounded-sm text-ui text-fg-2 transition-colors duration-200 hover:text-fg pointer-coarse:min-h-10"
                      >
                        {nb(l.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 font-mono text-meta tracking-normal text-muted">
          <span>© 2026 Leon</span>
          <span>{nb(TAGLINES.source)}</span>
        </div>
      </Container>
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.22em] text-center text-[clamp(120px,26vw,360px)] leading-[0.8] font-extrabold tracking-[-0.06em] text-transparent select-none [-webkit-text-stroke:1px_var(--line-strong)] [mask:linear-gradient(180deg,#000_10%,transparent_95%)]"
      >
        Leon
      </p>
    </footer>
  );
}
