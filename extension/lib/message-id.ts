// Id stable pour un message que le site ne numérote pas : un nouvel envoi du même échange donne le même id.
export async function deriveMessageId(prefix: 'u' | 'a', parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('\n'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
  return `${prefix}-${hex.join('').slice(0, 40)}`;
}
