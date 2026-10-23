import { Blocks, Globe, KeyRound, ListChecks, Plug, Terminal, Timer } from 'lucide-react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { ALL_TOOLS, TOOL_COUNT } from '../content';
import { LogoSphere, Tilt } from '../fx';
import { CtaBand, CtaLink, Kicker, SectionHeading } from '../parts';
import { ConnecteursCatalogue } from './connecteurs-catalogue';
import { PageHero, PageSection, PlannedBadge } from './page-hero';

// Page « Connecteurs » : le catalogue filtrable des outils, comment on branche, les conversations d'IA, ce qui est
// prévu. Les deux sites d'assistants que capte l'extension ne sont pas nommés (marketing.md, publicité comparative).

/** La sphère des outils, à faire tourner, posée sur un socle de verre. */
function SphereStage() {
  return (
    <figure className="relative mx-auto w-full max-w-[540px]">
      <div
        aria-hidden="true"
        className="absolute inset-[6%] rounded-full border border-line bg-[radial-gradient(closest-side,var(--glass-2),transparent)] shadow-[inset_0_1px_0_var(--hi)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[18%] rounded-full border border-dashed border-accent-line opacity-60"
      />
      <LogoSphere tools={ALL_TOOLS} size={46} srList={false} />
      <figcaption className="mt-2 text-center font-mono text-meta tracking-normal text-muted">
        {nb(`${TOOL_COUNT} outils`)}
        <span aria-hidden="true">{nb(' · faites tourner la sphère')}</span>
      </figcaption>
    </figure>
  );
}

const STEPS = [
  {
    icon: Plug,
    title: 'Choisir l’outil',
    text: 'Dans la page Connexions de votre espace, parmi les familles.',
  },
  {
    icon: KeyRound,
    title: 'Se connecter ou coller une clé',
    text: 'Un bouton « Se connecter avec… » quand l’éditeur le permet, sinon une clé d’API. L’aide dit où la trouver.',
  },
  {
    icon: Timer,
    title: 'Choisir la période',
    text: 'Leon lit 7, 30, 90 ou 365 jours en arrière. 30 par défaut.',
  },
  {
    icon: ListChecks,
    title: 'Tester et brancher',
    text: 'La connexion n’est enregistrée que si le test réussit. Ensuite, une relève toutes les 15 minutes.',
  },
] as const;

const CHANNELS = [
  {
    icon: Globe,
    title: 'Extension du navigateur',
    text: 'Pour deux assistants d’IA sur le web. Un écran de consentement, un interrupteur par site, une pause.',
    points: [
      'Jamais en navigation privée',
      'Jamais de pièce jointe',
      'Conversations privées à leur auteur',
    ],
  },
  {
    icon: Terminal,
    title: 'Assistant de code',
    text: 'À la fin de chaque session, la conversation est envoyée à Leon. Une commande rattrape les sessions manquées.',
    points: [
      'Texte seul, sans sorties d’outils',
      'Secrets masqués avant stockage',
      'Point du matin au démarrage',
    ],
  },
  {
    icon: Blocks,
    title: 'Serveur MCP',
    text: 'Dans l’autre sens : votre assistant interroge Leon, avec un jeton personnel que vous révoquez quand vous voulez.',
    points: [
      'search, fetch, briefing, remember',
      'Les mêmes droits que vous',
      'Un journal de ce qui a été lu',
    ],
  },
] as const;

const PLANNED = [
  { title: 'Google Workspace', text: 'Gmail, Drive, Agenda.' },
  { title: 'Microsoft 365', text: 'Teams, OneDrive, SharePoint.' },
  { title: 'Fichiers', text: 'PDF et documents Office.' },
] as const;

export function ConnecteursPage() {
  return (
    <>
      <PageHero
        kicker="Connecteurs"
        title={`${TOOL_COUNT} outils branchables, et vos conversations d’IA.`}
        lead="Tickets, pages, réunions, notes de CRM, conversations de support : Leon relève ce qui change toutes les 15 minutes et le garde tel quel, avec un lien vers l’original."
        actions={
          <>
            <CtaLink href="/inscription">Créer un espace</CtaLink>
            <CtaLink href="#catalogue" variant="secondary">
              Voir le catalogue
            </CtaLink>
          </>
        }
        accent="et vos conversations d’IA."
        aside={<SphereStage />}
      />

      <PageSection id="catalogue" labelledBy="catalogue-titre" className="pt-6 sm:pt-10">
        <SectionHeading
          id="catalogue-titre"
          kicker="Le catalogue"
          title="Tous les outils, par famille."
          lead="Dev, réunions, projet, CRM, support, mails et agenda. Choisissez une famille ou tapez un nom."
        />
        <ConnecteursCatalogue />
        <p className="mt-6 max-w-[720px] text-label leading-[1.6] text-muted">
          {nb(
            'Les connecteurs sont en bêta : chacun est testé sur les réponses d’exemple de la documentation de son éditeur. Les instances hébergées chez vous (GitLab, Jira Data Center) ne sont pas prises en charge.',
          )}
        </p>
      </PageSection>

      <PageSection labelledBy="brancher-titre">
        <SectionHeading
          id="brancher-titre"
          kicker="Brancher"
          title="Quatre gestes, une fois par outil."
          lead="Personne ne remplit de fiche ensuite : Leon relit l’outil de lui-même."
        />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-5 shadow-hi">
                {/* preserve-3d jusqu'à la pastille, et pas d'overflow sur la carte : sinon sa 3D est aplatie */}
                <div className="flex items-center justify-between [transform-style:preserve-3d]">
                  <span className="fx-pop grid size-10 place-items-center rounded-item border border-accent-line bg-accent-soft text-accent">
                    <s.icon aria-hidden="true" strokeWidth={1.7} className="size-[18px]" />
                  </span>
                  <span className="font-mono text-meta tracking-normal text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-title font-bold tracking-[-0.02em] text-fg">
                  {nb(s.title)}
                </h3>
                <p className="mt-2 text-body leading-[1.6] text-fg-2">{nb(s.text)}</p>
              </Tilt>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection labelledBy="ia-titre">
        <SectionHeading
          id="ia-titre"
          kicker="Conversations d’IA"
          title="Les conversations avec vos assistants d’IA."
          lead="Ce qui se dit avec un assistant est souvent ce qu’on ne retrouve nulle part ailleurs. Leon le garde, pour la personne qui l’a écrit."
        />
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {CHANNELS.map((c, i) => (
            <li key={c.title} className="site-reveal">
              <Tilt
                className={cn(
                  'h-full rounded-box border bg-panel p-6 shadow-hi',
                  i === 0 ? 'signal-glow fx-ring border-accent-line' : 'border-line',
                )}
              >
                {/* le filet Signal sur un calque rogné à part : un overflow sur la carte aplatirait sa 3D */}
                {i === 0 && (
                  <span
                    aria-hidden="true"
                    className="signal-line pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  />
                )}
                <span className="fx-pop relative grid size-11 place-items-center rounded-item border border-line bg-glass-3 text-accent">
                  <c.icon aria-hidden="true" strokeWidth={1.7} className="size-5" />
                </span>
                <h3 className="relative mt-5 text-title font-bold tracking-[-0.02em] text-fg">
                  {c.title}
                </h3>
                <p className="relative mt-2 text-body leading-[1.6] text-fg-2">{nb(c.text)}</p>
                <ul className="relative mt-5 grid gap-2 border-t border-line pt-4">
                  {c.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-label text-fg-2">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {nb(p)}
                    </li>
                  ))}
                </ul>
              </Tilt>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection labelledBy="prevu-titre" className="pt-4 sm:pt-8">
        <div className="site-reveal grid items-center gap-8 rounded-panel border border-dashed border-line-strong bg-glass-3 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <Kicker>Ensuite</Kicker>
            <h2
              id="prevu-titre"
              className="mt-3 text-[clamp(24px,2.8vw,34px)] leading-[1.1] font-bold tracking-[-0.03em] text-fg"
            >
              Ce qui n’est pas encore branchable.
            </h2>
            <p className="mt-3 text-body leading-[1.6] text-fg-2">
              {nb('Nous le disons pour que vous ne le découvriez pas après coup.')}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {PLANNED.map((p) => (
              <li key={p.title} className="rounded-card border border-line bg-panel p-4 shadow-hi">
                <PlannedBadge />
                <p className="mt-3 text-ui font-semibold text-fg">{p.title}</p>
                <p className="mt-1 text-label text-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </PageSection>

      <CtaBand
        title="Branchez un premier outil."
        text="Une clé ou un bouton, une période à lire, et la première relève commence."
      />
    </>
  );
}
