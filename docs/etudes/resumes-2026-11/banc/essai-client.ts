// Le vrai client de Leon (src/server/llm/openrouter-llm.ts), pas celui du banc, sur un cas de chaque étape servie
// par OpenRouter : il prouve que la production marche de bout en bout avec les modèles choisis (routage, flux,
// boucle d'outils de la discussion, coût facturé). Quelques dixièmes de centime.
//
// JEUX=jeux-validation npx tsx docs/etudes/resumes-2026-11/banc/essai-client.ts

import './env-factice';
import { z } from 'zod';
import { parseEnv } from '@/server/env';
import type { LlmStep } from '@/server/llm/llm';
import { modelForStep } from '@/server/llm/models';
import { createOpenRouterLlm } from '@/server/llm/openrouter-llm';
import { chargerCas, preparer, REGLAGES } from './jeux';
import { cle } from './openrouter';

const apiKey = cle();
const env = parseEnv({ ...process.env, OPENROUTER_API_KEY: apiKey });
const llm = createOpenRouterLlm({ apiKey, env });

for (const step of ['reponse', 'resume', 'fil', 'agenda'] as const satisfies LlmStep[]) {
  const [cas] = chargerCas(step);
  if (!cas) continue;
  const p = await preparer(step, cas);
  const debut = Date.now();
  let texte = '';
  for await (const delta of llm.streamText({ step, system: p.system, messages: p.messages, maxTokens: REGLAGES[step].maxTokens })) {
    texte += delta;
  }
  const { mesures } = p.traiter(texte);
  console.log(`\n## ${step} (${modelForStep(step, env)}, ${cas.id}, ${Date.now() - debut} ms)`);
  console.log(texte.slice(0, 300).replace(/\n/g, ' ⏎ '));
  console.log('mesures :', JSON.stringify(mesures).slice(0, 200));
}

// La discussion : la boucle d'outils du client, avec un outil qui rend un passage fixe.
const outils: string[] = [];
let reponse = '';
let fin = '';
for await (const event of llm.runAgent({
  step: 'discussion',
  system: 'You answer questions about the team’s work. Search before answering, then answer in one or two sentences.',
  messages: [{ role: 'user', content: 'When is the Fernhill SSO go-live?' }],
  tools: [
    {
      name: 'chercher',
      description: 'Searches the team’s sources and returns matching passages.',
      input: z.object({ requete: z.string() }),
      run: async () => '[1] Slack #fernhill, 14/11 : « The SSO go-live with Fernhill moves to 26/11, after their IdP freeze. »',
    },
  ],
  maxSteps: 4,
  maxTokens: REGLAGES.discussion.maxTokens,
})) {
  if (event.type === 'outil') outils.push(`${event.name}(${JSON.stringify(event.input)})`);
  if (event.type === 'texte') reponse += event.delta;
  if (event.type === 'fin') fin = event.reason;
}
console.log(`\n## discussion (${modelForStep('discussion', env)})`);
console.log('outils :', outils.join(', '), '| fin :', fin);
console.log(reponse.slice(0, 300));
