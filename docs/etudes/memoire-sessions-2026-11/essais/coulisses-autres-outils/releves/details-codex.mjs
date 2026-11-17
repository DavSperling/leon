#!/usr/bin/env node
// Complément du témoin de Codex : quelques formes de plus (noms de clés, gabarits), jamais un texte.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
const JETON = 'leon-essai-coulisses';
const home = resolve(process.argv[2] ?? '');
if (!basename(home).includes(JETON) || !basename(realpathSync(home)).includes(JETON)) { console.error('Refusé.'); process.exit(2); }
const ID = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const nom = (v) => (typeof v === 'string' && ID.test(v) ? v : v === undefined ? '-' : `<${typeof v}>`);
const gabarit = (v) => (typeof v === 'string' ? v.slice(0, 48).replace(/[A-Za-zÀ-ÿ]/g, 'a').replace(/[0-9]/g, '9') + (v.length > 48 ? '…' : '') : `<${typeof v}>`);
const cles = (o) => (o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).map((k) => (ID.test(k) ? k : `~${gabarit(k)}`)).sort() : []);
const forme = (v) => (v === null ? 'null' : Array.isArray(v) ? `tableau[${v.length}]` : typeof v === 'string' ? `chaine(${v.length})` : typeof v);
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
const vu = new Set();
const dire = (s) => { if (!vu.has(s)) { vu.add(s); console.log(s); } };
for (const fichier of rollouts(join(home, 'sessions')).sort()) {
  for (const brut of readFileSync(fichier, 'utf8').split('\n')) {
    if (!brut.trim()) continue;
    let l; try { l = JSON.parse(brut); } catch { continue; }
    const p = l.payload ?? {}; const it = p.item ?? {};
    if (l.type === 'session_meta') {
      dire(`session_meta.source : ${JSON.stringify(typeof p.source === 'string' ? nom(p.source) : cles(p.source))}`);
      dire(`thread_spawn : ${JSON.stringify(cles(p.source?.subagent?.thread_spawn))}`);
      dire(`session_meta : cli_version~${gabarit(p.cli_version)} originator=${nom(p.originator)} model_provider=${nom(p.model_provider)} git=${JSON.stringify(cles(p.git))}`);
    }
    if (l.type === 'turn_context') dire(`turn_context : approval_policy=${nom(p.approval_policy)} model~${gabarit(p.model)} effort=${nom(p.effort)} summary=${nom(p.summary)} sandbox_policy=${JSON.stringify(typeof p.sandbox_policy === 'string' ? nom(p.sandbox_policy) : cles(p.sandbox_policy))} sandbox_type=${nom(p.sandbox_policy?.type)}`);
    if (l.type === 'response_item') dire(`response_item/${nom(p.type)} : cles ${JSON.stringify(cles(p))}`);
    if (p.type === 'function_call') {
      let a; try { a = JSON.parse(p.arguments); } catch { a = undefined; }
      dire(`function_call ${nom(p.name)} : namespace=${nom(p.namespace)} arguments=${forme(p.arguments)} cles des arguments ${JSON.stringify(cles(a))}`);
    }
    if (p.type === 'function_call_output') {
      let o; try { o = JSON.parse(p.output); } catch { o = undefined; }
      dire(`function_call_output : output=${forme(p.output)} cles ${JSON.stringify(cles(o))}`);
    }
    if (p.type === 'custom_tool_call') dire(`custom_tool_call ${nom(p.name)} : input=${forme(p.input)}`);
    if (p.type === 'custom_tool_call_output') dire(`custom_tool_call_output : output=${forme(p.output)}`);
    if (p.type === 'agent_message') dire(`agent_message : content ${JSON.stringify((p.content ?? []).map((c) => cles(c)))}`);
    if (p.type === 'reasoning') dire(`reasoning : summary ${JSON.stringify((p.summary ?? []).map((c) => cles(c)))} encrypted_content=${forme(p.encrypted_content)}`);
    if (it.type === 'Extension') dire(`Extension : kind~${gabarit(it.kind)} action=${JSON.stringify(typeof it.action === 'string' ? nom(it.action) : cles(it.action))} query=${forme(it.query)} results=${forme(it.results)}`);
    if (it.type === 'SubAgentActivity') dire(`SubAgentActivity : kind=${nom(it.kind)} cles ${JSON.stringify(cles(it))}`);
    if (it.type === 'CollabAgentToolCall') dire(`CollabAgentToolCall : tool=${nom(it.tool)} status=${nom(it.status)} receiver_thread_ids=${forme(it.receiver_thread_ids)} receiver_agents=${forme(it.receiver_agents)} agents_states=${forme(it.agents_states)}`);
    if (it.type === 'CommandExecution') dire(`CommandExecution : status=${nom(it.status)} exit_code=${it.exit_code} source=${nom(it.source)} parsed_cmd=${forme(it.parsed_cmd)} command=${forme(it.command)}`);
    if (it.type === 'Reasoning') dire(`Reasoning (item) : summary_text=${forme(it.summary_text)} raw_content=${forme(it.raw_content)}`);
    if (p.type === 'task_complete') dire(`task_complete : last_agent_message=${forme(p.last_agent_message).replace(/\(\d+\)/, '(n)')}`);
    if (l.type === 'inter_agent_communication_metadata') dire(`inter_agent_communication_metadata : trigger_turn=${forme(p.trigger_turn)}`);
    if (l.metadata !== undefined) dire(`metadata de ligne : ${JSON.stringify(cles(l.metadata))}`);
  }
}
