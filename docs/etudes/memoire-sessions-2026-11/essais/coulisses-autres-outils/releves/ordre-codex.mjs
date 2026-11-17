#!/usr/bin/env node
// Complément du témoin de Codex : l'ordre des lignes de chaque fichier de l'essai (rang, type), et quelques identifiants
// techniques (kind, phase, role, statut, nombres). Jamais un texte : une valeur hors identifiant sort en gabarit
// (lettres en « a », chiffres en « 9 »). Refuse tout dossier sans le jeton de l'essai.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
const JETON = 'leon-essai-coulisses';
const home = resolve(process.argv[2] ?? '');
if (!basename(home).includes(JETON) || !basename(realpathSync(home)).includes(JETON)) { console.error('Refusé.'); process.exit(2); }
const ID = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const nom = (v) => (typeof v === 'string' && ID.test(v) ? v : v === undefined ? '-' : `<${typeof v}>`);
const gabarit = (v) => (typeof v === 'string' ? v.slice(0, 40).replace(/[A-Za-zÀ-ÿ]/g, 'a').replace(/[0-9]/g, '9') : `<${typeof v}>`);
function rollouts(d) {
  const out = [];
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const c = join(d, e.name);
    if (lstatSync(c).isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...rollouts(c));
    else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) out.push(c);
  }
  return out;
}
for (const [rang, fichier] of rollouts(join(home, 'sessions')).sort().entries()) {
  console.log(`=== fichier ${rang + 1}`);
  for (const brut of readFileSync(fichier, 'utf8').split('\n')) {
    if (!brut.trim()) continue;
    let l; try { l = JSON.parse(brut); } catch { continue; }
    const p = l.payload ?? {}; const it = p.item ?? {};
    const etiquette = [nom(l.type), nom(p.type), nom(it.type)].filter((x) => x !== '-').join('/');
    const plus = [];
    for (const [k, v] of [['role', p.role], ['phase', p.phase], ['name', p.name], ['status', p.status], ['kind', it.kind], ['item_status', it.status], ['item_tool', it.tool], ['thread_source', p.thread_source], ['history_mode', p.history_mode]]) if (v !== undefined) plus.push(`${k}=${nom(v)}`);
    for (const [k, v] of [['exit_code', it.exit_code], ['depth', p.source?.subagent?.thread_spawn?.depth], ['subagent_history_start_ordinal', p.subagent_history_start_ordinal], ['multi_agent_version', p.multi_agent_version]]) if (typeof v === 'number' || typeof v === 'string') plus.push(`${k}=${typeof v === 'number' ? v : nom(v)}`);
    for (const [k, v] of [['author', p.author], ['recipient', p.recipient], ['agent_path', it.agent_path ?? p.agent_path]]) if (v !== undefined) plus.push(`${k}~${gabarit(v)}`);
    if (p.parent_thread_id !== undefined) plus.push('parent_thread_id:present');
    if (p.forked_from_id !== undefined) plus.push('forked_from_id:present');
    if (Array.isArray(p.summary)) plus.push(`summary[${p.summary.length}]`);
    if (Array.isArray(p.content)) plus.push(`content[${p.content.map((c) => nom(c?.type)).join(',')}]`);
    console.log(`${typeof l.ordinal === 'number' ? l.ordinal : '?'} ${etiquette} ${plus.join(' ')}`);
  }
}
