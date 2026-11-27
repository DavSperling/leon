import type { ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { Container, tone } from '../parts';
import { DocumentationToc } from './documentation-toc';
import { PageHero } from './page-hero';

// Pages « Privacy » et « Terms » : la feuille et le plan de la page Documentation (pages.css, pg-doc et pg-manual).
// En anglais seulement, la version qui fait foi : lang="en" pour qu'un lecteur d'écran les lise en anglais sur le site
// français. Google exige les deux liens (même domaine que la page d'accueil) pour publier l'appli OAuth de Gmail et Drive.

export const CONTACT_EMAIL = 'amos.koskas@leonmemory.com';

export type LegalSection = { id: string; title: string; body: ReactNode };

export const List = ({ children }: { children: ReactNode }) => (
  <ul className="grid list-disc gap-2.5 pl-5 marker:text-muted">{children}</ul>
);

export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} className="s-tlink">
    {children}
  </a>
);

export const Contact = () => <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>;

export function LegalPage({
  title,
  lead,
  sections,
}: {
  title: string;
  lead: string;
  sections: readonly LegalSection[];
}) {
  return (
    <div className="s-page" lang="en">
      <PageHero title={title} lead={lead} />
      <section className="s-stage pg-doc">
        <Container className="s-grid gap-y-8">
          <div className="pg-doc__side">
            <DocumentationToc
              title="On this page"
              items={sections.map((s, i) => ({ id: s.id, label: s.title, tone: tone(i + 1) }))}
            />
          </div>
          <div className="s-sheet pg-manual">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="border-t border-line pt-12 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="s-h2 relative">
                  <span aria-hidden="true" className={cn('flag flag--left pg-tab', tone(i + 1))} />
                  {s.title}
                </h2>
                <div className="mt-5 grid gap-4 text-[16px] leading-[1.65] text-fg">{s.body}</div>
              </section>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
