// resume-worker.ts et tools.ts lisent l'environnement de Leon à l'import (env.ts) : le banc n'ouvre aucune base et
// n'appelle pas Anthropic, il pose donc des valeurs factices, avant tout import de src/server.
process.env.DATABASE_URL ??= 'postgres://banc:banc@127.0.0.1:1/banc';
process.env.BETTER_AUTH_SECRET ??= 'banc-banc-banc-banc-banc-banc-banc-banc';
process.env.BETTER_AUTH_URL ??= 'http://127.0.0.1:1';
process.env.LEON_LLM = '';
process.env.ANTHROPIC_API_KEY = '';
