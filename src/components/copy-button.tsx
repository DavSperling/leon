'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function CopyButton({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copié.');
    } catch {
      toast.error('Impossible de copier. Sélectionnez le texte à la main.');
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
      Copier
    </Button>
  );
}
