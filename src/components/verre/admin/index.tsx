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
  fil: 'États des fils',
};

type Day = AdminStats['parJour'][number];
type Series = { title: string; pick: (day: Day) => number; format: (value: number) => string };

// Une série sur 30 jours : barres fines, survol natif par jour (zone de survol de toute la hauteur).
function DailyBars({ title, days, pick, format }: Series & { days: Day[] }) {
  const values = days.map(pick);
  const max = Math.max(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const width = 300;
  const height = 56;
  const slot = width / Math.max(days.length, 1);
  return (
    <div className="min-w-0">
      <p className="text-label text-muted">{title}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-2 h-14 w-full"
        role="img"
        aria-label={`${title} : ${format(total)} sur 30 jours, au plus ${format(max)} en un jour`}
      >
        {days.map((day, i) => {
          const value = values[i] ?? 0;
          const h = max > 0 ? Math.max((value / max) * (height - 4), value > 0 ? 2 : 0) : 0;
          return (
            <g key={day.jour} className="group">
              <title>{`${dayLabel(day.jour)} : ${format(value)}`}</title>
              <rect
                x={i * slot}
                y="0"
                width={slot}
                height={height}
                className="fill-transparent transition-colors duration-150 group-hover:fill-n-150"
              />
              <rect
                x={i * slot + 1}
                y={height - h}
                width={Math.max(slot - 2, 1)}
                height={h}
                rx="1.5"
                className="fill-fg"
              />
            </g>
          );
        })}
        <line
          x1="0"
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          className="stroke-line-strong"
        />
      </svg>
    </div>
  );
}

// Une ligne du relevé : le chiffre (ici la valeur EST l'information), son détail, et sa série jour par jour à côté :
// les quatre séries partagent le même axe, écrit une fois sous la dernière.
function Line({
  label,
  value,
  detail,
  days,
  series,
}: {
  label: string;
  value: string;
  detail: string;
  days: Day[];
  series: Series;
}) {
  return (
    <div className="grid gap-x-10 gap-y-4 border-line border-t py-5 first:border-t-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-end">
      <div className="min-w-0">
        <p className="text-label text-muted">{label}</p>
        <p className="mt-1 text-h1 font-semibold tracking-[-0.022em] text-fg">{value}</p>
        <p className="mt-1 max-w-[46ch] text-label leading-[1.45] text-muted">{detail}</p>
      </div>
      <DailyBars days={days} {...series} />
    </div>
  );
}

// Un chiffre du pied du relevé : plus petit, sans série.
function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 py-4 md:px-6 md:first:pl-0 md:last:pr-0">
      <p className="text-label text-muted">{label}</p>
      <p className="mt-1 text-head font-semibold tracking-[-0.018em] text-fg">{value}</p>
      <p className="mt-1 text-label leading-[1.45] text-muted">{detail}</p>
    </div>
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
            <span className="shrink-0 text-fg-2">{row.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-n-150">
            <div
              className="h-full rounded-full bg-fg"
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
      <table className="w-full min-w-[560px] text-left text-ui whitespace-nowrap">
        <thead className="text-label text-muted">
          <tr>
            {head.map((cell, i) => (
              <th key={cell} className={`px-5 py-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
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
                  // les chiffres de la police en tabulaire élargissent aussi « . » et « , » : les nombres seuls
                  className={`px-5 py-2.5 ${i > 0 ? 'text-right text-fg-2' : 'text-fg'} ${typeof cell === 'number' ? 'tabular-nums' : ''}`}
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
    <>
      <PageHeader title="Admin" />

      {/* Le relevé : une seule feuille. Quatre lignes (un chiffre et ses 30 jours), puis quatre chiffres au pied. */}
      <GlassCard className="px-6 pt-1 pb-2">
        <Line
          label="Utilisateurs"
          value={int.format(utilisateurs.total)}
          detail={`+${int.format(utilisateurs.nouveaux7)} en 7 jours · +${int.format(utilisateurs.nouveaux30)} en 30`}
          days={stats.parJour}
          series={{ title: 'Inscriptions', pick: (d) => d.inscriptions, format: int.format }}
        />
        <Line
          label="Connexions (30 jours)"
          value={int.format(connexions.mois)}
          detail={`${int.format(connexions.semaine)} en 7 jours · ${int.format(connexions.total)} au total`}
          days={stats.parJour}
          series={{ title: 'Connexions', pick: (d) => d.connexions, format: int.format }}
        />
        <Line
          label="Questions (30 jours)"
          value={int.format(questions.mois)}
          detail={`en discussion · + ${int.format(questions.recherches30)} réponses de la recherche · ${int.format(questions.total)} au total`}
          days={stats.parJour}
          series={{
            title: 'Questions en discussion',
            pick: (d) => d.questions,
            format: int.format,
          }}
        />
        <Line
          label="Dépensé en API (30 jours)"
          value={usd(couts.mois)}
          detail={`${usd(couts.semaine)} en 7 jours · ${usd(couts.total)} au total, compté depuis la mise en ligne de ce tableau`}
          days={stats.parJour}
          series={{ title: 'Coût des API', pick: (d) => d.cout, format: (v) => usd(v) }}
        />
        {/* l'axe des quatre séries, une fois */}
        <div className="-mt-3 grid gap-x-10 pb-4 max-md:hidden md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <span />
          <div className="flex justify-between text-label text-muted">
            <span>{stats.parJour[0] && dayLabel(stats.parJour[0].jour)}</span>
            <span>{stats.parJour.at(-1) && dayLabel(stats.parJour.at(-1)?.jour as string)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 border-line border-t md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-line">
          <Figure
            label="Actifs"
            value={int.format(actifs.semaine)}
            detail={`sur 7 jours · ${int.format(actifs.jour)} aujourd’hui · ${int.format(actifs.mois)} sur 30`}
          />
          <Figure
            label="Organisations"
            value={int.format(organisations.total)}
            detail={`${int.format(organisations.actives30)} actives sur 30 jours · ${int.format(organisations.membresMoyen)} membres en moyenne`}
          />
          <Figure
            label="Temps passé par connexion"
            value={duration(connexions.tempsMedian)}
            detail={`médiane · moyenne ${duration(connexions.tempsMoyen)} · ${duration(connexions.tempsTotal30)} en tout sur 30 jours, compté depuis la mise en ligne`}
          />
          <Figure
            label="Coût par question"
            value={usd(perQuestion, 3)}
            detail={`sur 30 jours · ${int.format(utilisateurs.deuxFacteurs)} comptes avec la 2FA`}
          />
        </div>
      </GlassCard>

      <Section
        title="Où va l’argent"
        description={`Sur 30 jours : ${int.format(couts.appels30)} appels au modèle, ${compact.format(couts.tokensEntree30)} tokens lus, ${compact.format(couts.tokensSortie30)} écrits.${couts.nonChiffres30 > 0 ? ` ${int.format(couts.nonChiffres30)} appels à un modèle sans tarif connu ne sont pas chiffrés.` : ''}`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <GlassCard className="px-5 py-4">
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
          <GlassCard className="px-5 py-4">
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
        <GlassCard className="px-5 py-4">
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

      <Section title="Organisations, les 50 plus récemment actives">
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
    </>
  );
}
