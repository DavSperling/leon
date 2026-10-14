// Relit le JSON qu'un prompt de rangement embarque entre <tag> et </tag> (chaque « < » y est écrit <).
export function readPromptJson(prompt: string, tag: string): unknown {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = prompt.indexOf(open);
  const end = prompt.indexOf(close, start);
  if (start === -1 || end === -1) throw new Error(`balise <${tag}> introuvable dans le prompt`);
  return JSON.parse(prompt.slice(start + open.length, end));
}
