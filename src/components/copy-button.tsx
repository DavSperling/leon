'use client';

import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyText } from './copy-text';

export function CopyButton({ text }: { text: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => copyText(text)}>
      <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
      Copier
    </Button>
  );
}
