import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand, Button, GlassCard } from '@/components';
import { nb, rise } from '@/lib';

// Pages système seules sur l'aurore (404, erreur racine) : la carte de la connexion, un titre court, une phrase au besoin, un seul bouton.

export function StandaloneMessage({ title, description, action }: { title: string; description?: string; action: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-14">
      <motion.div className="w-full max-w-[392px]" variants={rise} initial="initial" animate="animate">
        <div className="-mx-1.5"><Brand withVersion={false} /></div>
        <GlassCard variant="raised" className="mt-5 p-6 shadow-panel backdrop-blur-[30px] sm:p-7">
          <h1 className="text-h2 font-semibold tracking-[-0.018em] text-fg">{nb(title)}</h1>
          {description && <p className="mt-2 text-body text-muted">{nb(description)}</p>}
          <div className="mt-6">{action}</div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export function NotFound() {
  return (
    <StandaloneMessage
      title="Cette page n’existe pas."
      action={<Button asChild variant="secondary"><Link to="/">Retour à l’accueil</Link></Button>}
    />
  );
}
