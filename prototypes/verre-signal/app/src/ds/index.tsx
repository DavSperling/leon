import { CalendarDays, Check, ChevronDown, Layers, MessageSquarePlus, Moon, Plug, RotateCcw, Search, Sparkles, Sun, Trash2, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  AlertDialog, Badge, Beam, Button, Checkbox, CitationChip, CitedText, CodeLine, Collapsible, CollapsibleContent, CollapsibleTrigger, CopyButton, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger,
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  EmptyState, Field, GlassCard, Highlighted, IconButton, Input, Kbd, MOD_KEY, Notice, PageHeader, Pagination, Pill, Popover, PopoverContent, PopoverTrigger,
  Section, Select, Sheet, SheetContent, SheetTrigger, Skeleton, SkeletonText, SourceChip, SourceLink, Sparkline, Spotlight, StatusBadge, Switch, Textarea, ToolIcon, Tooltip, toast, useThinking, usePalette,
} from '@/components';
import { BACKFILL_OPTIONS, CAPTURE_CHANNELS, getItem, kindLabel, MEMORY, search } from '@/data';
import { cn, duration, ease, formatDateTime, rise, stagger, useTheme, useTitle } from '@/lib';

// Vitrine du système de design (/_ds) : chaque jeton et chaque composant, dans ses variantes et ses états.
// ?ouvrir=dialogue | alerte | menu | popover | feuille ouvre un calque au chargement (captures).

const COLORS: Array<[string, string]> = [
  ['bg', 'fond de page'], ['glass', 'verre léger (cartes)'], ['glass-2', 'verre dense (cartes hautes)'], ['glass-3', 'verre de contrôle'],
  ['float', 'calque flottant'], ['menu', 'menu opaque'], ['scrim', 'voile sous un calque'], ['hover', 'survol'], ['ink', 'encre active'],
  ['line', 'trait fin'], ['line-strong', 'trait appuyé'], ['hi', 'reflet haut'],
  ['text', 'texte'], ['text-2', 'texte secondaire'], ['muted', 'texte atténué'],
  ['accent', 'accent'], ['accent-ink', 'texte sur accent'], ['accent-soft', 'accent doux'], ['accent-line', 'trait d’accent'], ['ring', 'anneau de focus'],
  ['mark-bg', 'surlignage'], ['mark-ink', 'texte surligné'], ['ok', 'point d’état'],
  ['success', 'succès'], ['success-soft', ''], ['warning', 'avertissement'], ['warning-soft', ''], ['destructive', 'danger'], ['destructive-soft', ''], ['info', 'information'], ['info-soft', ''],
  ['blob-1', 'aurore 1'], ['blob-2', 'aurore 2'], ['blob-3', 'aurore 3'], ['blob-4', 'aurore (travail)'],
];
const TYPE: Array<[string, string, string]> = [
  ['text-h1', '30 px · 700', 'Recherche'], ['text-h2', '21 px · 600', 'Jetons personnels'], ['text-title', '16,5 px · 600', 'Call ACME — renouvellement 2027'],
  ['text-lead', '15,5 px', 'Le renouvellement est validé sur le principe.'], ['text-body', '14 px', 'Retrouver une information dans tout ce que Leon a gardé.'],
  ['text-ui', '13,5 px', 'Brancher un outil'], ['text-label', '12,5 px', 'Rédigée par l’IA à partir des résultats ci-dessous.'], ['text-meta', '11,5 px', 'il y a 4 min · 12 oct. 2026, 14:12'], ['text-meta font-mono', '11,5 px · Geist Mono', '[3] · 142 ms · v0.4.2'],
];
const RADII: Array<[string, string]> = [['rounded-panel', '26'], ['rounded-box', '18'], ['rounded-card', '16'], ['rounded-field', '12'], ['rounded-item', '10'], ['rounded-chip', '7'], ['rounded-full', 'pastille']];

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid gap-2.5">
      <p className="font-mono text-meta tracking-normal text-muted">{label}</p>
      <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
    </div>
  );
}

function Swatches() {
  const { theme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(COLORS.map(([n]) => [n, cs.getPropertyValue(`--${n}`).trim()])));
  }, [theme]);
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
      {COLORS.map(([name, hint]) => (
        <li key={name} className="flex items-center gap-3 rounded-card border border-line bg-glass p-2.5">
          <span className="size-10 shrink-0 rounded-[10px] shadow-[inset_0_0_0_1px_var(--line-strong)]" style={{ background: `var(--${name})` }} />
          <span className="min-w-0">
            <span className="block font-mono text-[12px] tracking-normal text-fg">--{name}</span>
            <span className="block truncate font-mono text-[10.5px] tracking-normal text-muted" title={values[name]}>{values[name]}</span>
            {hint && <span className="block truncate text-[11.5px] text-fg-2">{hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DesignSystem() {
  useTitle('Système de design');
  const { theme, setTheme } = useTheme();
  const { thinking, setThinking } = useThinking();
  const { openPalette } = usePalette();
  const [params] = useSearchParams();
  const open = params.get('ouvrir');
  // au repos à l'arrivée : le faisceau ne tourne que pendant que Leon travaille (bouton « Rechercher » ci-dessous)
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[]>(['github']);
  const [checked, setChecked] = useState(true);
  const [replay, setReplay] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [free, setFree] = useState(false);
  const res = search('où en est le renouvellement du contrat ACME ?');
  const r1 = res.results[0]!;

  useEffect(() => setThinking(busy), [busy, setThinking]);

  return (
    <>
      <PageHeader
        title="Système de design"
        subtitle="Verre + signal, violet atténué : les jetons, les composants et leurs états, dans les deux thèmes."
        meta={<span>Les écrans importent tout depuis <code className="font-mono text-fg-2">@/components</code>, <code className="font-mono text-fg-2">@/lib</code> et <code className="font-mono text-fg-2">@/data</code> ; mode d’emploi dans <code className="font-mono text-fg-2">src/components/README.md</code>.</span>}
        actions={
          <div role="group" aria-label="Thème" className="flex gap-0.5 rounded-full border border-line bg-glass-3 p-0.5">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={cn('inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-label font-medium text-fg-2 transition-colors', theme === t && 'bg-ink text-fg shadow-[inset_0_0_0_1px_var(--line-strong),inset_0_1px_0_var(--hi)]')}>
                {t === 'dark' ? <Moon aria-hidden="true" className="size-3.5" /> : <Sun aria-hidden="true" className="size-3.5" />}
                {t === 'dark' ? 'Sombre' : 'Clair'}
              </button>
            ))}
          </div>
        }
      />

      {/* sommaire en simples liens : les pastilles sont des filtres, pas une table des matières */}
      <nav aria-label="Sections de la vitrine" className="-mt-2 mb-10 flex flex-wrap gap-x-5 gap-y-2 text-ui">
        {['Couleurs', 'Typographie', 'Formes', 'Mouvement', 'Boutons', 'Pastilles', 'Puces', 'Verre et signal', 'Champs', 'Retours', 'Calques', 'Texte et données'].map((s) => (
          <a key={s} href={`#ds-${s.toLowerCase().replace(/\s+/g, '-')}`} className="rounded-sm text-fg-2 transition-colors hover:text-fg">{s}</a>
        ))}
      </nav>

      <Section id="ds-couleurs" title="Couleurs" description="Variables CSS par thème (src/styles/tokens.css) ; en Tailwind : bg-panel, text-muted, border-line, text-accent…">
        <Swatches />
      </Section>

      <Section id="ds-typographie" title="Typographie" description="Manrope pour le texte, les dates et les phrases (chiffres alignés : tabular-nums) ; Geist Mono seulement pour les nombres seuls, identifiants, [n], touches et code.">
        <GlassCard variant="raised" className="divide-y divide-line">
          {TYPE.map(([cls, spec, sample]) => (
            <div key={cls} className="grid items-baseline gap-1 px-5 py-3.5 sm:grid-cols-[230px_minmax(0,1fr)]">
              <span className="font-mono text-meta tracking-normal text-muted">{cls.split(' ')[0]} · {spec}</span>
              <span className={cn(cls, cls === 'text-h1' && 'font-bold tracking-[-0.03em]', cls === 'text-h2' && 'font-semibold tracking-[-0.02em]', cls === 'text-title' && 'font-semibold tracking-[-0.018em]')}>{sample}</span>
            </div>
          ))}
        </GlassCard>
      </Section>

      <Section id="ds-formes" title="Formes" description="Rayons nets, traits de 1 px, reflet intérieur en haut (shadow-hi), ombres longues et douces.">
        <div className="flex flex-wrap gap-3">
          {RADII.map(([cls, px]) => (
            <div key={cls} className={cn('grid h-20 w-32 place-items-center border border-line-strong bg-glass-2 shadow-hi', cls)}>
              <span className="text-center font-mono text-[11px] tracking-normal text-muted">{cls}<br />{px}</span>
            </div>
          ))}
          <div className="grid h-20 w-40 place-items-center rounded-card border border-line bg-glass-2 shadow-panel"><span className="font-mono text-[11px] text-muted">shadow-panel</span></div>
          <div className="glass-float grid h-20 w-40 place-items-center rounded-card border border-line-strong shadow-float"><span className="text-center font-mono text-[11px] text-muted">glass-float<br />+ border shadow-float</span></div>
        </div>
      </Section>

      <Section id="ds-mouvement" title="Mouvement" description="@/lib/motion : entrée 260 ms ease-out, sortie 140 ms, ressort pour les puces et indicateurs, cascade de 70 ms. ?instant=1 ou mouvement réduit : état final.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <GlassCard variant="raised" className="grid gap-2 p-5 font-mono text-[12px] tracking-normal text-fg-2">
            <p>duration.enter = {duration.enter} s · duration.exit = {duration.exit} s</p>
            <p>ease.out = [{ease.out.join(', ')}]</p>
            <p>spring = ressort 520 / 36 · pageVariants · rise · fade · pop · stagger(i)</p>
            <div className="mt-2"><Button size="sm" icon={RotateCcw} onClick={() => setReplay((n) => n + 1)}>Rejouer la cascade</Button></div>
          </GlassCard>
          <ol key={replay} className="grid gap-2">
            {['Call ACME — renouvellement 2027', 'Relance — contrat ACME v3', 'LIN-42 · Export SSO pour ACME'].map((t, i) => (
              <motion.li key={t} variants={rise} initial="initial" animate="animate" transition={{ delay: stagger(i) }}>
                <GlassCard spotlight className="px-4 py-3 text-ui font-semibold">{t}</GlassCard>
              </motion.li>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="ds-boutons" title="Boutons" description="Button (un seul primary par vue ; secondary ; quiet pour l’action répétée de chaque ligne ; ghost, destructive, link ; sm, md, lg ; icône ; chargement) et IconButton (libellé obligatoire, infobulle).">
        <div className="grid gap-6">
          {(['primary', 'secondary', 'quiet', 'ghost', 'destructive', 'link'] as const).map((v) => (
            <Demo key={v} label={`variant="${v}"`}>
              <Button variant={v} size="sm">Petit</Button>
              <Button variant={v}>Moyen</Button>
              <Button variant={v} size="lg" icon={v === 'destructive' ? Trash2 : MessageSquarePlus}>{v === 'destructive' ? 'Supprimer' : 'Demander à Leon'}</Button>
              <Button variant={v} loading>Envoi…</Button>
              <Button variant={v} disabled>Désactivé</Button>
            </Demo>
          ))}
          <Demo label="IconButton : ghost, secondary, primary ; sm, md, lg ; chargement">
            <IconButton icon={Search} label="Rechercher" size="sm" />
            <IconButton icon={Search} label="Rechercher" />
            <IconButton icon={Search} label="Rechercher" size="lg" />
            <IconButton icon={Plug} label="Brancher" variant="secondary" />
            <IconButton icon={Sparkles} label="Envoyer la question" variant="primary" />
            <IconButton icon={Sparkles} label="Leon répond…" variant="primary" loading />
          </Demo>
        </div>
      </Section>

      <Section id="ds-pastilles" title="Pastilles" description="Pill (filtres), Badge (6 tons), StatusBadge (indexation : l’état courant reste discret, seules les exceptions sont des pastilles), Kbd.">
        <div className="grid gap-6">
          <Demo label="Pill : default + chevron, active (amovible), warning, menu ouvert">
            <Pill icon={Wrench} chevron>Outil</Pill>
            <Pill icon={Layers} chevron>Type</Pill>
            <Pill icon={CalendarDays} chevron aria-expanded="true">Période</Pill>
            <Pill icon={UserRound}>Personne</Pill>
            <Pill variant="active" removable aria-label="Retirer le filtre « Depuis : 30 jours »">Depuis&#8239;: 30 jours</Pill>
            <Tooltip content="Filtre non reconnu : la recherche l’ignore."><Pill variant="warning" icon={TriangleAlert} removable aria-label="Retirer le filtre « Outil : slack »">Outil&#8239;: slack</Pill></Tooltip>
          </Demo>
          <Demo label="Badge">
            {(['neutral', 'accent', 'success', 'warning', 'destructive', 'info'] as const).map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
            <Badge tone="warning">Non essayé en réel</Badge>
            <Badge>Bientôt</Badge>
            <Badge tone="accent" mono>1 234</Badge>
          </Demo>
          <Demo label="StatusBadge">
            <StatusBadge status="running" />
            <StatusBadge status="done" />
            <StatusBadge status="failed" />
          </Demo>
          <Demo label="Kbd">
            <Kbd>{MOD_KEY}K</Kbd><Kbd>↵</Kbd><Kbd>esc</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd>
          </Demo>
        </div>
      </Section>

      <Section id="ds-puces" title="Puces" description="CitationChip [n] (zone de clic de 33 px ; survol, focus, actif), SourceChip, ToolIcon par outil, famille et canal.">
        <div className="grid gap-6">
          <Demo label="CitationChip : repos, actif, lien">
            <p className="text-lead">… avant fin octobre<CitationChip n={1} label="Source 1 : Call ACME — renouvellement 2027" />. Relancés le 17<CitationChip n={2} label="Source 2 : Relance — contrat ACME v3" active />, puis LIN-42<CitationChip n={3} href="#ds-puces" label="Résultat 3 : LIN-42 · Export SSO pour ACME" />.</p>
          </Demo>
          <Demo label="SourceChip, SourceLink">
            <SourceChip kind="fathom" boxed extra={['Réunion', 'Équipe Sales']} />
            <SourceLink kind="fathom" href="https://fathom.video/calls/48213" />
            <SourceChip kind="github" author="Julie Martin" date={getItem('github-118')!.date} time />
            <SourceChip kind="claude_code" label="Claude Code" author="Vous" />
          </Demo>
          <Demo label="ToolIcon : outils de la planche, puis par famille (boxed), et canaux">
            {(['github', 'linear', 'notion', 'fathom', 'hubspot', 'outlook', 'jira', 'intercom'] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-2 text-label text-fg-2"><ToolIcon kind={k} boxed />{kindLabel(k)}</span>
            ))}
            {CAPTURE_CHANNELS.map((c) => <span key={c.id} className="inline-flex items-center gap-2 text-label text-fg-2"><ToolIcon kind={c.id} boxed />{c.label}</span>)}
          </Demo>
        </div>
      </Section>

      <Section id="ds-verre-et-signal" title="Verre et signal" description="GlassCard (panel, raised ; signal : une carte par vue, celle en cours ; spotlight : cartes cliquables ; reading : seulement pendant que Leon lit), Spotlight, Beam (seulement pendant que Leon travaille) ; l’aurore s’intensifie alors (useThinking).">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <Beam active={busy} className="rounded-box">
            <div className="flex h-[58px] items-center gap-3 rounded-box border border-line-strong bg-glass-2 pr-2 pl-[18px] shadow-hi">
              <Search aria-hidden="true" className="size-[18px] text-muted" strokeWidth={1.6} />
              <span className="min-w-0 flex-1 truncate text-[16.5px] font-medium tracking-[-0.015em]">où en est le renouvellement du contrat ACME ?{busy && <span className="caret" />}</span>
              <Button variant="primary" size="lg" className="pr-2" onClick={() => setBusy((b) => !b)}>
                {busy ? 'Arrêter' : 'Rechercher'}<Kbd className="border-current/50 bg-transparent text-current opacity-85">↵</Kbd>
              </Button>
            </div>
          </Beam>
          <p className="flex items-center gap-2 font-mono text-meta tracking-normal text-muted">
            {busy ? <><span className="spin" />Beam active · aurore intensifiée (thinking = {String(thinking)})</> : <><Check aria-hidden="true" className="size-3.5 text-success" />Beam au repos</>}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <GlassCard className="p-4"><p className="font-mono text-meta text-muted">variant="panel"</p><p className="mt-2 text-ui text-fg-2">Résultats, lignes de liste.</p></GlassCard>
            <GlassCard variant="raised" className="p-4"><p className="font-mono text-meta text-muted">variant="raised"</p><p className="mt-2 text-ui text-fg-2">Réponse, aperçu, formulaires.</p></GlassCard>
            <GlassCard variant="raised" signal className="p-4"><p className="font-mono text-meta text-muted">signal</p><p className="mt-2 text-ui text-fg-2">Filet dégradé et halo : cartes importantes.</p></GlassCard>
            <GlassCard spotlight className="p-4"><p className="font-mono text-meta text-muted">spotlight</p><p className="mt-2 text-ui text-fg-2">Survolez : la lueur suit le pointeur.</p></GlassCard>
            <GlassCard reading className="p-4"><p className="font-mono text-meta text-muted">reading</p><p className="mt-2 text-ui text-fg-2">Leon lit cette source.</p></GlassCard>
            <Spotlight className="rounded-card border border-line bg-glass-3 p-4 shadow-hi"><p className="font-mono text-meta text-muted">&lt;Spotlight&gt;</p><p className="mt-2 text-ui text-fg-2">Autour de n’importe quel bloc.</p></Spotlight>
          </div>
        </div>
      </Section>

      <Section id="ds-champs" title="Champs" description="Field relie libellé, aide et erreur au contrôle (id, aria-describedby, aria-invalid).">
        <GlassCard variant="raised" className="grid gap-5 p-5 md:grid-cols-2">
          <Field label="Nom de l’appareil" help="Pour le reconnaître dans la liste.">
            <Input placeholder="MacBook de David" />
          </Field>
          <Field label="Jeton d’accès à grain fin" error="Clé refusée par GitHub." aside={<a className="text-accent hover:underline" href="#ds-champs">Où trouver la clé ↗</a>}>
            <Input defaultValue="github_pat_11AB…" />
          </Field>
          <Field label="Dépôts" help="Un dépôt par ligne, au format propriétaire/nom (20 au plus).">
            <Textarea autoGrow rows={2} placeholder="acme/leon" defaultValue={'acme/leon\nacme/site'} />
          </Field>
          <Field label="Lire ce qui date de" help="Borne le premier passage, donc son coût.">
            <Select options={BACKFILL_OPTIONS} defaultValue="30" />
          </Field>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox checked={checked} onCheckedChange={setChecked} label="Synchroniser chaque nuit" />
            <Checkbox defaultChecked label="Non contrôlée" />
            <Checkbox checked={false} label="Désactivée" disabled />
            <Switch defaultChecked label="Mémoriser le thème" />
            <Switch label="Notifications" />
          </div>
          <Input disabled placeholder="Champ désactivé" />
        </GlassCard>
      </Section>

      <Section id="ds-retours" title="Retours" description="Notice (neutral pour une simple remarque ; info, success, warning, error quand il faut agir ; action), EmptyState, Skeleton, toast().">
        <div className="grid gap-3">
          <Notice tone="neutral">Cette question attend encore sa réponse.</Notice>
          <Notice tone="info">La première synchronisation peut prendre quelques minutes.</Notice>
          <Notice tone="success">GitHub est branché. La première synchronisation démarre dans la minute.</Notice>
          <Notice tone="warning">Personne ne s’appelle « julien » dans l’équipe.</Notice>
          <Notice tone="error" action={{ label: 'Réessayer', icon: RotateCcw, onClick: () => toast('Nouvel essai.') }}>Leon n’a pas pu répondre pour le moment. Votre question est gardée.</Notice>
          <div className="grid gap-3 md:grid-cols-2">
            <EmptyState icon={Search} title="Aucun résultat." description="Essayez d’autres mots, retirez un filtre, ou cherchez le titre d’un document." />
            <EmptyState title="Il n’y a pas autant de résultats." description="Cette page est vide : les résultats s’arrêtent avant." action={<Button>Revenir à la première page</Button>} />
          </div>
          <GlassCard variant="raised" className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
            <SkeletonText />
            <div className="flex items-center gap-3"><Skeleton className="size-9 rounded-full" /><Skeleton className="h-3 w-28" /></div>
          </GlassCard>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => toast('Synchronisation demandée : elle démarre dans la minute.')}>toast()</Button>
            <Button size="sm" onClick={() => toast.success('Jeton révoqué.')}>toast.success()</Button>
            <Button size="sm" onClick={() => toast.error('Impossible de révoquer. Réessayez.')}>toast.error()</Button>
          </div>
        </div>
      </Section>

      <Section id="ds-calques" title="Calques" description="DropdownMenu (lignes nettes, cases), Popover, Tooltip, Dialog (avec ou sans déclencheur), AlertDialog, Sheet, Collapsible, palette ⌘K : verre, entrée 220 ms, sortie 140 ms.">
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu defaultOpen={open === 'menu'} modal={false}>
            <DropdownMenuTrigger asChild><Pill icon={Wrench} chevron variant={tools.length ? 'active' : 'default'}>{tools.length ? `Outil · ${tools.length}` : 'Outil'}</Pill></DropdownMenuTrigger>
            <DropdownMenuContent className="w-[252px]">
              <DropdownMenuLabel meta="sources">Filtrer par outil</DropdownMenuLabel>
              {(['claude_code', 'fathom', 'github', 'hubspot', 'linear', 'notion', 'outlook'] as const).map((k, i) => (
                <DropdownMenuCheckboxItem key={k} checked={tools.includes(k)} onCheckedChange={(c) => setTools((t) => (c ? [...t, k] : t.filter((x) => x !== k)))} meta={[184, 62, 611, 237, 418, 305, 583][i]}>
                  <span className="inline-flex items-center gap-2.5"><ToolIcon kind={k} />{{ claude_code: 'Claude Code', fathom: 'Fathom', github: 'GitHub', hubspot: 'HubSpot', linear: 'Linear', notion: 'Notion', outlook: 'Outlook' }[k]}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} destructive onSelect={() => setTools([])}>Tout retirer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover defaultOpen={open === 'popover'}>
            <PopoverTrigger asChild><Button size="sm">Popover</Button></PopoverTrigger>
            <PopoverContent>
              <p className="font-semibold">Personne</p>
              <div className="mt-3 flex gap-2"><Input placeholder="Nom ou e-mail" className="h-9" /><Button size="sm" variant="primary">Ajouter</Button></div>
            </PopoverContent>
          </Popover>
          <Tooltip content="Ouvrir dans Fathom"><Button size="sm" variant="ghost">Tooltip</Button></Tooltip>
          <Dialog defaultOpen={open === 'dialogue'}>
            <DialogTrigger asChild><Button size="sm">Dialog</Button></DialogTrigger>
            <DialogContent title="GitHub" description="Ce que Leon lit dans GitHub est visible de toute l’équipe.">
              <Notice tone="warning">Déjà branché par Julie. Évitez de brancher deux fois le même espace.</Notice>
              <Field label="Jeton d’accès à grain fin" aside={<a className="text-accent hover:underline" href="#ds-calques">Où trouver la clé ↗</a>}><Input placeholder="github_pat_…" /></Field>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose>
                <Button variant="primary">Tester et brancher</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog
            defaultOpen={open === 'alerte'}
            trigger={<Button size="sm" variant="destructive" icon={Trash2}>AlertDialog</Button>}
            title="Supprimer « Julie Martin (acme) » ?"
            description="Leon ne lira plus GitHub avec cette clé, qui est effacée. Les sources déjà captées restent dans la mémoire."
            confirmLabel="Supprimer"
            onConfirm={() => toast.success('Connexion supprimée.')}
          />
          <Button size="sm" variant="ghost" onClick={() => setFree(true)}>Dialog sans déclencheur</Button>
          <Dialog open={free} onOpenChange={setFree}>
            <DialogContent title="Créer un jeton" size="sm">
              <p className="text-body text-fg-2">Ouverte par un état (comme ?creer=1) : à la fermeture, le focus revient quand même au bouton.</p>
              <DialogFooter><DialogClose asChild><Button variant="ghost">Fermer</Button></DialogClose></DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet defaultOpen={open === 'feuille'}>
            <SheetTrigger asChild><Button size="sm">Sheet</Button></SheetTrigger>
            <SheetContent title="Call ACME — renouvellement 2027" description="Fathom · Réunion · Équipe Sales · 14 oct. 2026">
              <p className="text-body text-fg-2">Feuille du bas : l’aperçu d’un résultat ou d’une source sous 920 px, le menu mobile. Poignée, filet Signal, 88 % de la hauteur au plus, retour du focus à l’ouvreur.</p>
            </SheetContent>
          </Sheet>
          <Button size="sm" icon={Search} onClick={openPalette}>Palette ⌘K</Button>
        </div>
        <Collapsible className="mt-6 max-w-[420px]">
          <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-full text-ui font-medium text-fg-2 hover:text-fg">
            ou coller une clé
            <ChevronDown aria-hidden="true" className="size-4 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Field label="Clé d’API" help="Collez la clé : Leon la teste avant de brancher."><Input placeholder="Collez la clé ici" /></Field>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      <Section id="ds-texte-et-données" title="Texte et données" description="Highlighted (extraits marqués), CitedText (renvois collés au mot et à la ponctuation), CopyButton, CodeLine (wrap pour une longue commande), Pagination, Sparkline (immobile) ; données de @/data.">
        <div className="grid gap-4">
          <GlassCard variant="raised" signal className="px-[22px] pt-[18px] pb-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-accent"><Sparkles aria-hidden="true" className="size-4" strokeWidth={1.6} />Réponse de Leon</p>
            <p className="mt-2.5 max-w-[80ch] text-lead text-fg">
              <CitedText text={res.answer ?? ''} renderCite={(n) => <CitationChip n={n} label={`Résultat ${n} : ${res.results[n - 1]?.title ?? 'Sans titre'}`} active={lit === n} onMouseEnter={() => setLit(n)} onMouseLeave={() => setLit(null)} />} />
            </p>
          </GlassCard>
          <GlassCard spotlight className="px-4 pt-3.5 pb-3">
            <div className="flex items-center gap-2"><SourceChip kind={r1.kind} boxed extra={[r1.natureLabel, r1.origin]} /><span className="ml-auto font-mono text-[11px] text-muted">[{r1.n}]</span></div>
            <h3 className="mt-2 text-title font-semibold tracking-[-0.018em]">{r1.title}</h3>
            {r1.passages.map((p) => (
              <div key={p.turn} className="mt-2 rounded-field bg-glass-3 px-3 py-2.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-fg-2">{p.author}<span className="text-[11.5px] font-normal text-muted tabular-nums">{formatDateTime(p.date)}</span></p>
                <p className="mt-0.5 text-body text-fg-2"><Highlighted text={p.snippet} /></p>
              </div>
            ))}
          </GlassCard>
          <CodeLine code="https://leon.acme.fr" />
          <CodeLine wrap code='claude mcp add --transport http leon https://leon.acme.fr/api/mcp --header "Authorization: Bearer <votre jeton>"' />
          <div className="flex flex-wrap items-center gap-3"><CopyButton value="leon_rDJLqXoCDcj76vzZin2UfXejTMMbDDRP" /><CopyButton value="x" label="Copier le jeton" variant="ghost" /></div>
          <GlassCard className="grid gap-4 p-4">
            <Pagination page={2} pages={7} href={(p) => `/_ds?page=${p}`} />
            <Pagination page={1} hasNext href={(p) => `/_ds?page=${p}`} />
          </GlassCard>
          <div className="w-56"><Sparkline values={MEMORY.activity} label="Activité des 15 derniers jours" /></div>
        </div>
      </Section>
    </>
  );
}
