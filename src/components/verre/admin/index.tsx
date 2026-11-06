import { formatRelative } from '@/lib/format';
import type { AdminStats } from '@/server/admin/stats';
import { PageHeader, Section } from '../ui/layout';
import { GlassCard } from '../ui/surfaces';

// Tableau des admins de Leon : en français seulement, il ne sert qu'à l'équipe.

const int = new Intl.NumberFormat('fr-FR');
const usd = (value: number, digits = 2) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const STEPS: Record<string, string> = {
  reponse: 'Réponses de la recherche',
  discussion: 'Discussions',
  point: 'Points du matin',
  resume: 'Résumés de session',
};

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <GlassCard className="p-4">
      <p className="text-label text-muted">{label}</p>
      <p className="mt-1 text-h2 font-semibold tabular-nums tracking-[-0.02em] text-fg">{value}</p>
      {detail && <p className="mt-1 text-label text-fg-2">{detail}</p>}
    </GlassCard>
  );
}

type Day = AdminStats['parJour'][number];

// Une série sur 30 jours : barres fines, survol natif par jour (zone de survol de toute la hauteur).
function DailyBars({
  title,
  days,
  pick,
  format,
}: {
  title: string;
  days: Day[];
  pick: (day: Day) => number;
  format: (value: number) => string;
}) {
  const values = days.map(pick);
  const max = Math.max(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const width = 300;
  const height = 80;
  const slot = width / Math.max(days.length, 1);
  return (
    <GlassCard className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-ui font-medium text-fg">{title}</p>
        <p className="text-label tabular-nums text-muted">{format(total)} sur 30 jours</p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-3 h-20 w-full"
        role="img"
        aria-label={`${title} : ${format(total)} sur 30 jours, au plus ${format(max)} en un jour`}
      >
        <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-line" />
        {days.map((day, i) => {
          const value = values[i] ?? 0;
          const h = max > 0 ? Math.max((value / max) * (height - 4), value > 0 ? 2 : 0) : 0;
          return (
            <g key={day.jour}>
              <title>{`${dayLabel(day.jour)} : ${format(value)}`}</title>
              <rect x={i * slot} y="0" width={slot} height={height} fill="transparent" />
              <rect
                x={i * slot + 1}
                y={height - h}
                width={Math.max(slot - 2, 1)}
                height={h}
                rx="1.5"
                className="fill-accent"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-meta text-muted">
        <span>{days[0] && dayLabel(days[0].jour)}</span>
        <span>{days.at(-1) && dayLabel(days.at(-1)?.jour as string)}</span>
      </div>
    </GlassCard>
  );
}

// Une répartition : nom, barre proportionnelle, valeur.
function Breakdown({
  rows,
  empty,
}: {
  rows: { nom: string; value: number; label: string }[];
  empty: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  if (rows.length === 0) return <p className="text-body text-muted">{empty}</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.nom} className="grid gap-1">
          <div className="flex justify-between gap-3 text-ui">
            <span className="truncate text-fg">{row.nom}</span>
            <span className="shrink-0 tabular-nums text-fg-2">{row.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-glass-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <GlassCard className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-ui">
        <thead className="text-label text-muted">
          <tr>
            {head.map((cell, i) => (
              <th key={cell} className={`px-4 py-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lignes figées, rendues une fois côté serveur
            <tr key={r} className="border-t border-line">
              {row.map((cell, i) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: colonnes figées
                  key={i}
                  className={`px-4 py-2.5 ${i > 0 ? 'text-right tabular-nums text-fg-2' : 'text-fg'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

export function AdminDashboard({ stats, now }: { stats: AdminStats; now: Date }) {
  const { utilisateurs, actifs, organisations, connexions, questions, couts } = stats;
  const seen = (iso: string | null) => (iso ? formatRelative(new Date(iso), now, 'fr') : 'jamais');
  const perQuestion =
    questions.mois + questions.recherches30 > 0
      ? couts.mois / (questions.mois + questions.recherches30)
      : 0;
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Admin"
        subtitle="Ce qui se passe sur Leon, toutes organisations confondues."
        meta="Visible des seuls e-mails de LEON_ADMINS. Coûts et temps passé comptés depuis la mise en ligne de ce tableau."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Utilisateurs"
          value={int.format(utilisateurs.total)}
          detail={`+${int.format(utilisateurs.nouveaux7)} en 7 jours · +${int.format(utilisateurs.nouveaux30)} en 30`}
        />
        <Tile
          label="Actifs"
          value={int.format(actifs.semaine)}
          detail={`sur 7 jours · ${int.format(actifs.jour)} aujourd’hui · ${int.format(actifs.mois)} sur 30`}
        />
        <Tile
          label="Organisations"
          value={int.format(organisations.total)}
          detail={`${int.format(organisations.actives30)} actives sur 30 jours · ${organisations.membresMoyen} membres en moyenne`}
        />
        <Tile
          label="Dépensé en API (30 jours)"
          value={usd(couts.mois)}
          detail={`${usd(couts.semaine)} en 7 jours · ${usd(couts.total)} au total`}
        />
        <Tile
          label="Connexions (30 jours)"
          value={int.format(connexions.mois)}
          detail={`${int.format(connexions.semaine)} en 7 jours · ${int.format(connexions.total)} au total`}
        />
        <Tile
          label="Temps passé par connexion"
          value={duration(connexions.tempsMedian)}
          detail={`médiane · moyenne ${duration(connexions.tempsMoyen)} · ${duration(connexions.tempsTotal30)} en tout sur 30 jours`}
        />
        <Tile
          label="Questions (30 jours)"
          value={int.format(questions.mois)}
          detail={`en discussion · + ${int.format(questions.recherches30)} réponses de la recherche · ${int.format(questions.total)} au total`}
        />
        <Tile
          label="Coût par question"
          value={usd(perQuestion, 3)}
          detail={`sur 30 jours · ${int.format(utilisateurs.deuxFacteurs)} comptes avec la 2FA`}
        />
      </div>

      <Section title="Les 30 derniers jours">
        <div className="grid gap-3 md:grid-cols-2">
          <DailyBars
            title="Inscriptions"
            days={stats.parJour}
            pick={(d) => d.inscriptions}
            format={int.format}
          />
          <DailyBars
            title="Connexions"
            days={stats.parJour}
            pick={(d) => d.connexions}
            format={int.format}
          />
          <DailyBars
            title="Questions en discussion"
            days={stats.parJour}
            pick={(d) => d.questions}
            format={int.format}
          />
          <DailyBars
            title="Coût des API"
            days={stats.parJour}
            pick={(d) => d.cout}
            format={(v) => usd(v)}
          />
        </div>
      </Section>

      <Section
        title="Où va l’argent"
        description={`Sur 30 jours : ${int.format(couts.appels30)} appels au modèle, ${compact.format(couts.tokensEntree30)} tokens lus, ${compact.format(couts.tokensSortie30)} écrits.${couts.nonChiffres30 > 0 ? ` ${int.format(couts.nonChiffres30)} appels à un modèle sans tarif connu ne sont pas chiffrés.` : ''}`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <GlassCard className="p-4">
            <p className="mb-4 text-ui font-medium text-fg">Par modèle</p>
            <Breakdown
              empty="Aucun appel sur 30 jours."
              rows={couts.parModele.map((m) => ({
                nom: m.nom,
                value: m.cout,
                label: `${usd(m.cout)} · ${int.format(m.appels)} appels`,
              }))}
            />
          </GlassCard>
          <GlassCard className="p-4">
            <p className="mb-4 text-ui font-medium text-fg">Par usage</p>
            <Breakdown
              empty="Aucun appel sur 30 jours."
              rows={couts.parEtape.map((e) => ({
                nom: STEPS[e.nom] ?? e.nom,
                value: e.cout,
                label: `${usd(e.cout)} · ${int.format(e.appels)} appels`,
              }))}
            />
          </GlassCard>
        </div>
      </Section>

      <Section title="Connecteurs branchés">
        <GlassCard className="p-4">
          <Breakdown
            empty="Aucun connecteur branché."
            rows={stats.connecteurs.map((c) => ({
              nom: c.nom,
              value: c.total,
              label: `${int.format(c.total)} · ${int.format(c.organisations)} organisation${c.organisations > 1 ? 's' : ''}`,
            }))}
          />
        </GlassCard>
      </Section>

      <Section title="Organisations" description="Les 50 plus récemment actives.">
        <Table
          head={[
            'Organisation',
            'Membres',
            'Questions (30 j)',
            'Questions',
            'Connecteurs',
            'Dernière activité',
          ]}
          rows={stats.listeOrganisations.map((o) => [
            o.nom,
            o.membres,
            o.questions30,
            o.questions,
            o.connecteurs,
            seen(o.derniereActivite),
          ])}
        />
      </Section>

      <Section title="Derniers inscrits">
        <Table
          head={['Personne', 'E-mail', 'Organisation', 'Inscrit', 'Dernière activité']}
          rows={stats.derniersInscrits.map((u) => [
            u.nom,
            u.email,
            u.organisation ?? '—',
            seen(u.creeLe),
            seen(u.derniereActivite),
          ])}
        />
      </Section>
    </div>
  );
}
