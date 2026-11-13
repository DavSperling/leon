'use client';

import { KeyRound, Laptop, MessageSquare, Puzzle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, PanelNote, Section, SidePanel, Thing, ThingGrid } from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import { AssistantSetup } from './assistants';
import { ComputerSetup } from './computers';
import { ExtensionSetup } from './extension';
import { Glyph } from './reglages';
import { CreateTokenPanel, captionOf, GLYPHS, type Token, TokenPanel } from './tokens';

type Add = 'computer' | 'assistant' | 'token' | 'extension';
// Une ancre de Connexions ou de l'onboarding ouvre le panneau qui la sert.
const ANCHORS: Record<string, Add> = {
  '#ordinateurs': 'computer',
  '#assistants': 'assistant',
  '#extension': 'extension',
};

export type IntegrationsProps = {
  computers: Token[];
  assistants: Token[];
  tokens: Token[];
  command: string | null;
  instructions: string | null;
  address: string;
  serverUrl: string;
  extensionPrompt: string;
};

/**
 * Le groupe Assistants : ce qui est connecté (ordinateurs, assistants, jetons) en cartes, puis ce qu'on peut ajouter en
 * tuiles. Le détail et la révocation vivent dans le panneau de chaque carte ; chaque tuile ouvre comment le connecter.
 */
export function IntegrationsSettings({
  computers,
  assistants,
  tokens,
  command,
  instructions,
  address,
  serverUrl,
  extensionPrompt,
}: IntegrationsProps) {
  const t = useTranslations('settings');
  const [adding, setAdding] = useState<Add | null>(null);
  const [thing, setThing] = useState<Token | null>(null);
  const [thingOpen, setThingOpen] = useState(false);
  // la place de la carte ouverte : quand elle s'en va (révoquée), le focus va à celle qui prend sa place
  const thingIndex = useRef(0);
  const grid = useRef<HTMLUListElement>(null);
  // une clé neuve à chaque création : le jeton en clair disparaît avec le panneau
  const [session, setSession] = useState(0);
  // le jeton créé est déjà dans la liste (la page se relit) : caché tant que son panneau est ouvert, puis il arrive
  const [created, setCreated] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const add = (what: Add) => {
    if (what === 'token') setSession((n) => n + 1);
    setAdding(what);
  };

  useEffect(() => {
    const follow = () => {
      const what = ANCHORS[window.location.hash];
      if (what && (what !== 'computer' || command)) setAdding(what);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [command]);

  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(null), 3000);
    return () => clearTimeout(timer);
  }, [fresh]);

  const closeAdding = (open: boolean) => {
    if (open) return;
    if (adding === 'token' && created) {
      setFresh(created);
      setCreated(null);
    }
    setAdding(null);
  };

  const connected = [...computers, ...assistants, ...tokens.filter((x) => x.hint !== created)];
  const gone = thing !== null && !thingOpen && !connected.some((x) => x.id === thing.id);

  // Révoquée ou déconnectée, la carte disparaît avec le focus : il passe à la carte suivante, sinon au titre.
  useEffect(() => {
    if (!gone) return;
    setThing(null);
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('[role="dialog"]')) return;
    const cards = grid.current?.querySelectorAll<HTMLElement>(':scope > li > *');
    const next = cards?.[Math.min(thingIndex.current, cards.length - 1)];
    const heading = document.getElementById('connectes-titre');
    if (next) next.focus();
    else if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [gone]);

  return (
    <>
      <Section id="connectes" title={t('connectedTitle')} count={connected.length || undefined}>
        {connected.length > 0 ? (
          <ThingGrid ref={grid}>
            {connected.map((x, i) => (
              <Thing
                key={x.id}
                size="card"
                picture={<Glyph icon={GLYPHS[x.kind]} />}
                name={
                  x.kind === 'manuel' && x.hint === fresh ? (
                    <span className="mark is-on">{x.name}</span>
                  ) : (
                    x.name
                  )
                }
                caption={captionOf(x, t('kindComputer'))}
                label={t('manageNamed', { name: x.name })}
                onClick={() => {
                  thingIndex.current = i;
                  setThing(x);
                  setThingOpen(true);
                }}
              />
            ))}
          </ThingGrid>
        ) : (
          <EmptyState title={t('nothingConnected')} description={t('nothingConnectedHelp')} />
        )}
      </Section>

      <Section title={t('addTitle')}>
        <ThingGrid>
          {command && (
            <Thing
              id="ordinateurs"
              picture={<Glyph icon={Laptop} size={28} />}
              name={t('kindComputer')}
              pill={t('connect')}
              label={t('connectComputer')}
              onClick={() => add('computer')}
            />
          )}
          <Thing
            id="assistants"
            picture={<Glyph icon={MessageSquare} size={28} />}
            name={t('kindAssistant')}
            pill={t('connect')}
            label={t('connectAssistant')}
            onClick={() => add('assistant')}
          />
          <Thing
            id="jetons"
            picture={<Glyph icon={KeyRound} size={28} />}
            name={t('kindToken')}
            pill={t('create')}
            label={t('createToken')}
            onClick={() => add('token')}
          />
          <Thing
            id="extension"
            picture={<Glyph icon={Puzzle} size={28} />}
            name={t('kindExtension')}
            pill={t('install')}
            label={t('installExtension')}
            onClick={() => add('extension')}
          />
        </ThingGrid>
      </Section>

      {thing && <TokenPanel token={thing} open={thingOpen} onOpenChange={setThingOpen} />}

      <SidePanel
        open={adding === 'computer'}
        onOpenChange={closeAdding}
        picture={<Glyph icon={Laptop} size={44} />}
        title={t('connectComputer')}
      >
        <ComputerSetup command={command} instructions={instructions} />
        <PanelNote className="mt-6">{nb(t('computersDescription'))}</PanelNote>
      </SidePanel>

      <SidePanel
        open={adding === 'assistant'}
        onOpenChange={closeAdding}
        picture={<Glyph icon={MessageSquare} size={44} />}
        title={t('connectAssistant')}
      >
        <AssistantSetup address={address} />
        <PanelNote className="mt-6">{nb(t('assistantsDescription'))}</PanelNote>
      </SidePanel>

      <SidePanel
        open={adding === 'extension'}
        onOpenChange={closeAdding}
        picture={<Glyph icon={Puzzle} size={44} />}
        title={t('extensionTitle')}
      >
        <ExtensionSetup
          prompt={extensionPrompt}
          serverUrl={serverUrl}
          onToken={() => add('token')}
        />
      </SidePanel>

      <CreateTokenPanel
        key={session}
        open={adding === 'token'}
        onOpenChange={closeAdding}
        onCreated={setCreated}
      />
    </>
  );
}
