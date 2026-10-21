import { ArrowRight, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, GlassCard } from '@/components';
import { SEARCH_EXAMPLES, SYNTAX_HELP } from '@/data';
import { cn, nb, stagger } from '@/lib';
import { riseAt } from './motion';
import { searchHref } from './url';

/** Requête en code : la clé des filtres atténuée (`outil:`), la valeur et les phrases exactes en clair. */
export function QueryCode({ q, className }: { q: string; className?: string }) {
  return (
    <code className={cn('inline-block max-w-full rounded-chip border border-line bg-glass-3 px-2 py-[3px] font-mono text-[12.5px] leading-[18px] tracking-normal whitespace-pre text-fg', className)}>
      {(q.match(/"[^"]*"?|\s+|[^\s"]+/g) ?? []).map((part, i) => {
        const m = /^(\w+:)(.+)$/.exec(part);
        return m ? <span key={i}><span className="text-muted">{m[1]}</span>{m[2]}</span> : part;
      })}
    </code>
  );
}

/** Accueil sans requête : quatre recherches d'exemple, puis la syntaxe des filtres, repliée (divulgation progressive). */
export function Welcome({ appear }: { appear: false | 'initial' }) {
  // au retour des résultats, l'accueil remonte une fois la barre en place
  const reveal = (i: number) => ({ variants: riseAt, custom: 0.16 + stagger(i, 0.04), initial: appear, animate: 'animate' }) as const;
  return (
    <div className="mt-11 grid gap-7 max-sm:mt-8">
      <section aria-labelledby="exemples">
        <motion.h2 id="exemples" {...reveal(0)} className="mb-4 text-h2 font-semibold tracking-[-0.02em] text-fg">Quelques recherches pour commencer</motion.h2>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {SEARCH_EXAMPLES.map((ex, i) => (
            <motion.li key={ex.q} {...reveal(i + 1)}>
              <GlassCard spotlight className="group h-full has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
                <Link to={searchHref(ex.q)} className="grid gap-2 px-4 py-3.5 outline-none">
                  <span className="min-w-0"><QueryCode q={ex.q} /></span>
                  <span className="flex items-center gap-3">
                    <span className="text-body text-muted transition-colors duration-200 group-hover:text-fg-2">{ex.hint}</span>
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={1.7}
                      className="ml-auto size-4 shrink-0 -translate-x-1.5 text-accent opacity-0 transition-[translate,opacity] duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-has-[a:focus-visible]:translate-x-0 group-has-[a:focus-visible]:opacity-100"
                    />
                  </span>
                </Link>
              </GlassCard>
            </motion.li>
          ))}
        </ul>
      </section>

      <motion.section aria-labelledby="filtres" {...reveal(5)}>
        <Collapsible>
          <h2 id="filtres">
            <CollapsibleTrigger className="group -mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-field px-1.5 text-ui font-medium text-fg-2 transition-colors duration-200 hover:text-fg">
              Pour affiner, écrivez-le dans la barre
              <ChevronDown aria-hidden="true" strokeWidth={1.8} className="size-3.5 transition-[rotate] duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent>
            <GlassCard className="mt-2.5 px-2 py-1.5">
              <dl className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 sm:gap-x-2">
                {SYNTAX_HELP.map((s) => (
                  <div key={s.code} className="grid grid-cols-[148px_minmax(0,1fr)] items-baseline gap-3 rounded-field px-2.5 py-2.5 max-sm:grid-cols-[minmax(0,1fr)] max-sm:gap-1.5">
                    <dt><QueryCode q={s.code} /></dt>
                    <dd className="text-body text-fg-2">{nb(s.text)}</dd>
                  </div>
                ))}
              </dl>
            </GlassCard>
          </CollapsibleContent>
        </Collapsible>
      </motion.section>
    </div>
  );
}
