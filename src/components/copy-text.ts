import { toast } from 'sonner';

// Copie `text` dans le presse-papiers et le dit ; `done` est le message de réussite.
export async function copyText(text: string, done = 'Copié.'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Impossible de copier. Sélectionnez le texte à la main.');
  }
}
