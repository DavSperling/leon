import { toast } from 'sonner';
import type { ActionResult } from '@/app/(taches)/taches/run-action';
import { safely } from '../safely';

// Attend l'action d'un réglage : une erreur s'affiche, et la réponse dit si le réglage est passé.
export async function succeeded(call: Promise<ActionResult>): Promise<boolean> {
  const result = await safely(call);
  if (!result.ok) toast.error(result.error);
  return result.ok;
}
