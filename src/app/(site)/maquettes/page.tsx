import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Tilt } from '@/components/site/fx';
import { MAQUETTES } from '@/components/site/maquettes';
import { Container, Kicker } from '@/components/site/parts';
import { nb } from '@/lib/verre/nb';

export const metadata: Metadata = {
  title: 'Maquettes de l’accueil',
  description:
    'Trois directions pour la page d’accueil de Leon, dans le design « Verre + signal ».',
  robots: { index: false, follow: false },
};

/** Aperçu schématique de chaque maquette (décoratif) : sa composition en quelques blocs. */
function Preview({ n }: { n: string }) {
  const bar = 'rounded-full bg-muted/35';
  if (n === '1')
    return (
      <div className="grid h-full content-center justify-items-center gap-2 px-8">
        <span className={`${bar} h-1.5 w-16 bg-accent-line`} />
        <span className={`${bar} h-3 w-[70%] bg-fg-2/70`} />
        <span className={`${bar} h-3 w-[52%] bg-accent`} />
        <span className={`${bar} mt-1 h-1.5 w-[58%]`} />
        <span className="mt-3 h-6 w-[82%] rounded-[8px] border border-accent-line bg-glass-2" />
        <span className="grid w-[82%] grid-cols-[1.2fr_1fr] gap-1.5">
          <span className="signal-line relative h-14 overflow-hidden rounded-[8px] border border-line bg-glass-2" />
          <span className="grid gap-1">
            <span className="h-4 rounded-[6px] border border-line bg-panel" />
            <span className="h-4 rounded-[6px] border border-line bg-panel" />
            <span className="h-4 rounded-[6px] border border-line bg-panel" />
          </span>
        </span>
      </div>
    );
  if (n === '2')
    return (
      <div className="grid h-full grid-cols-2 items-center gap-4 px-7">
        <span className="grid gap-2">
          <span className={`${bar} h-1.5 w-12 bg-accent-line`} />
          <span className={`${bar} h-3 w-full bg-fg-2/70`} />
          <span className={`${bar} h-3 w-4/5 bg-fg-2/70`} />
          <span className={`${bar} h-1.5 w-3/4`} />
          <span className="mt-2 h-5 w-20 rounded-full bg-accent" />
        </span>
        <span className="relative mx-auto aspect-square w-full max-w-[150px]">
          <span className="absolute inset-0 rounded-full border border-line-strong" />
          <span className="absolute inset-[22%] rounded-full border border-accent-line" />
          <span className="absolute inset-[42%] rounded-full bg-[linear-gradient(140deg,var(--accent),var(--logo-2))]" />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <span
              key={deg}
              className="absolute top-1/2 left-1/2 size-3 rounded-[4px] bg-[#fff] shadow-[0_0_0_1px_var(--line)]"
              style={{
                transform: `rotate(${deg}deg) translate(68px) rotate(-${deg}deg) translate(-50%,-50%)`,
              }}
            />
          ))}
        </span>
      </div>
    );
  return (
    <div className="grid h-full content-center gap-3 px-8">
      <span className={`${bar} h-1.5 w-24`} />
      <span className="h-4 w-[86%] rounded-[4px] bg-fg-2/70" />
      <span className="h-4 w-[60%] rounded-[4px] bg-[linear-gradient(90deg,var(--mark-bg),var(--accent-soft))]" />
      <span className="relative mt-2 grid gap-2 border-l border-accent-line pl-4">
        {['w-[70%]', 'w-[55%]', 'w-[64%]'].map((w) => (
          <span key={w} className="relative flex items-center gap-2">
            <span className="absolute -left-[21px] size-2 rounded-full bg-accent" />
            <span className="h-1.5 w-8 rounded-full bg-accent-line" />
            <span className={`${bar} h-1.5 ${w}`} />
          </span>
        ))}
      </span>
    </div>
  );
}

export default function MaquettesPage() {
  return (
    <Container className="pt-36 pb-24">
      <div className="site-rise max-w-[720px]">
        <Kicker>Trois directions</Kicker>
        <h1 className="mt-3 text-[clamp(36px,5vw,60px)] leading-[1.02] font-extrabold tracking-[-0.045em] text-fg">
          {nb('Trois maquettes de l’accueil, un seul design.')}
        </h1>
        <p className="mt-5 text-[17px] leading-[1.6] text-fg-2">
          {nb(
            'Mêmes jetons, même aurore, même verre que l’appli. Ce qui change : la composition, le point focal et le ton. La maquette 1 est servie sur l’accueil tant que le choix n’est pas fait.',
          )}
        </p>
      </div>
      <ol className="mt-14 grid gap-5 lg:grid-cols-3">
        {MAQUETTES.map((m, i) => (
          <li key={m.n} className="site-rise" style={{ '--i': i + 1 } as CSSProperties}>
            <Tilt max={6} className="h-full rounded-panel">
              <Link
                href={`/maquettes/${m.n}`}
                className="group flex h-full flex-col overflow-hidden rounded-panel border border-line bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] shadow-panel backdrop-blur-[30px]"
              >
                <div
                  aria-hidden="true"
                  className="relative h-[220px] overflow-hidden border-b border-line bg-glass-3"
                >
                  <div className="site-dots absolute inset-0" />
                  <div className="fx-pop relative h-full transition-transform duration-500 ease-out group-hover:scale-[1.03]">
                    <Preview n={m.n} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-meta tracking-normal text-accent">
                      Maquette {m.n}
                    </span>
                    {m.n === '1' && (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                        sur l’accueil
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-h2 font-bold tracking-[-0.025em] text-fg">{m.name}</h2>
                  <p className="mt-2 text-body leading-[1.6] text-fg-2">{nb(m.pitch)}</p>
                  <ul className="mt-4 grid gap-2">
                    {m.points.map((p) => (
                      <li key={p} className="flex gap-2.5 text-label leading-[1.5] text-muted">
                        <span
                          aria-hidden="true"
                          className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent"
                        />
                        {nb(p)}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-ui font-semibold text-accent">
                    Voir la maquette
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={2}
                      className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </Link>
            </Tilt>
          </li>
        ))}
      </ol>
    </Container>
  );
}
