import { Fragment, type ReactElement } from 'react';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ariaKeys, type Binding, bindingKeys, type ShortcutId, shortcutOf } from './shortcuts';

// Une touche (ou une séquence : « G puis T ») en capsules.
export function BindingCaps({ binding }: { binding: Binding }) {
  const keys = bindingKeys(binding);
  return (
    <KbdGroup>
      {keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 && <span className="text-xs text-muted-foreground">puis</span>}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </KbdGroup>
  );
}

// La touche principale d'une action : la première de la table.
export function KeyCaps({ id }: { id: ShortcutId }) {
  const [first] = shortcutOf(id).bindings;
  return first && <BindingCaps binding={first} />;
}

type ShortcutHintProps = {
  id: ShortcutId;
  label?: string; // le libellé de la table par défaut
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactElement; // le bouton ou le lien qui porte l'infobulle
};

// L'infobulle d'un bouton : ce qu'il fait, puis la touche qui le fait au clavier.
export function ShortcutHint({ id, label, side = 'bottom', children }: ShortcutHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-keyshortcuts={ariaKeys(id)}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label ?? shortcutOf(id).label}
        <KeyCaps id={id} />
      </TooltipContent>
    </Tooltip>
  );
}
