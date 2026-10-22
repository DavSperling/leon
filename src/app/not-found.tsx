import type { Metadata } from 'next';
import Link from 'next/link';
import { StandaloneMessage } from '@/components/verre/auth/standalone-card';
import { ThemeToggle } from '@/components/verre/auth/theme-toggle';
import { StandaloneShell } from '@/components/verre/shell';
import { Button } from '@/components/verre/ui/button';

export const metadata: Metadata = { title: 'Page introuvable' };

export default function NotFound() {
  return (
    <StandaloneShell>
      <StandaloneMessage
        title="Cette page n’existe pas."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Retour à l’accueil</Link>
          </Button>
        }
      />
      <ThemeToggle />
    </StandaloneShell>
  );
}
