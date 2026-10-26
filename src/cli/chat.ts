import { createInterface } from 'node:readline';
import { parseServerEnv } from './env';
import { findLocalPassages, type LocalPassage, loadLocalDocuments } from './local-documents';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const LOGO = `\u001b[38;2;116;190;195m  ████  ██\n  ██  ██  ██\n  ██████  ██\n  ██  ██  ██\n  ██  ██  ████\u001b[0m`;

async function askLeon(
  env: { url: string; token: string },
  query: string,
  history: ChatMessage[],
  localContext: LocalPassage[],
): Promise<string> {
  const response = await fetch(new URL('/api/cli/chat', env.url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, history: history.slice(-10), localContext }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result.answer !== 'string') {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Leon ne répond pas.');
  }
  return result.answer;
}

export async function runChat(directory: string): Promise<number> {
  let config: ReturnType<typeof parseServerEnv>;
  try {
    config = parseServerEnv(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Configuration Leon invalide.');
    return 1;
  }
  console.log(LOGO);
  console.log('Leon · chat privé au terminal');
  console.log(`Lecture locale : ${directory}`);
  console.log(
    'Les fichiers ne sont pas enregistrés dans Leon. Les extraits utiles sont transmis au modèle hébergé.',
  );
  console.log('Chargement des documents…\n');
  const documents = await loadLocalDocuments(directory);
  console.log(`${documents.length} extrait(s) prêt(s). Écrivez « quitter » pour terminer.\n`);

  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\u001b[38;2;116;190;195mVous › \u001b[0m',
  });
  const history: ChatMessage[] = [];
  lines.prompt();
  for await (const line of lines) {
    const query = line.trim();
    if (!query) {
      lines.prompt();
      continue;
    }
    if (['quitter', 'exit', 'quit'].includes(query.toLocaleLowerCase('fr'))) break;
    const localContext = findLocalPassages(documents, query);
    try {
      const answer = await askLeon(config, query, history, localContext);
      console.log(`\n\u001b[38;2;116;190;195mLeon ›\u001b[0m ${answer}\n`);
      history.push({ role: 'user', content: query }, { role: 'assistant', content: answer });
    } catch (error) {
      console.error(
        `\n${error instanceof Error ? error.message : 'Erreur de connexion à Leon.'}\n`,
      );
    }
    lines.prompt();
  }
  return 0;
}
