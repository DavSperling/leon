import { z } from 'zod';
import type { Hit, Person } from './schemas';

const HeadersSchema = z.object({
  from: z
    .object({
      email: z.string().nullish(),
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
    })
    .nullish(),
});

// hs_email_headers est un JSON écrit dans un texte : l'expéditeur y est sous « from ».
export function emailSender(props: Hit['properties']): Person | null {
  try {
    const from = HeadersSchema.parse(JSON.parse(props.hs_email_headers ?? '')).from;
    const name = [from?.firstName, from?.lastName].filter(Boolean).join(' ').trim();
    const email = from?.email?.trim() || null;
    return name || email ? { name: name || email, email } : null;
  } catch {
    return null;
  }
}
