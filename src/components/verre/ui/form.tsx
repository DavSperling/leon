'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Checkbox as RCheckbox, Select as RSelect, Switch as RSwitch } from 'radix-ui';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { mergeRefs } from '@/lib/verre/refs';

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** Les attributs que Field donne au contrôle qu'il contient (id, aria-describedby, aria-invalid). */
function useFieldProps(id?: string) {
  const f = useContext(FieldContext);
  return {
    id: id ?? f?.id,
    'aria-describedby': f?.describedBy,
    'aria-invalid': f?.invalid || undefined,
  };
}

export type FieldProps = {
  label: ReactNode;
  /** Aide sous le champ (atténuée) */
  help?: ReactNode;
  /** Erreur sous le champ (rouge) ; remplace l'aide et passe le contrôle en aria-invalid. */
  error?: ReactNode;
  /** Élément à droite du libellé (lien « Où trouver la clé ↗ », compteur…) */
  aside?: ReactNode;
  /** id du contrôle (sinon généré) : pour le viser d'ailleurs (aria-controls d'un bouton « Voir »). */
  id?: string;
  className?: string;
  children: ReactNode;
};

/** Libellé + contrôle + aide ou erreur, reliés (htmlFor, aria-describedby) ; l'erreur est annoncée (role=alert). Le contrôle (Input, Textarea, Select) lit le contexte. */
export function Field({ label, help, error, aside, id: ownId, className, children }: FieldProps) {
  const auto = useId();
  const id = ownId ?? auto;
  const noteId = `${id}-note`;
  const note = error ?? help;
  return (
    <FieldContext.Provider
      value={{ id, describedBy: note ? noteId : undefined, invalid: Boolean(error) }}
    >
      <div className={cn('grid gap-1.5', className)}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-label font-medium text-fg">
            {label}
          </label>
          {aside && <span className="text-label">{aside}</span>}
        </div>
        {children}
        {note && (
          // une erreur est un nouvel élément (role=alert inséré : annoncé), pas l'aide qui change de rôle
          <p
            key={error ? 'erreur' : 'aide'}
            id={noteId}
            role={error ? 'alert' : undefined}
            className={cn('text-label', error ? 'font-medium text-destructive' : 'text-muted')}
          >
            {typeof note === 'string' ? nb(note) : note}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

// 16 px au doigt : sous 16 px, Safari iOS zoome sur le champ au focus. Pas d'« outline-none » : au focus, le champ
// prend l'anneau d'encre de la règle globale (:focus-visible) en plus de son trait ; en erreur, le trait reste rouge.
const CONTROL =
  'w-full rounded-field border border-line-strong bg-sheet text-body text-fg transition-[border-color] duration-150 pointer-coarse:text-[16px] ' +
  'placeholder:text-muted hover:border-fg-2 focus-visible:border-fg ' +
  'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, id, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(CONTROL, 'h-10 px-3 max-shell:h-11', className)}
      {...useFieldProps(id)}
      {...props}
    />
  );
}

export type TextareaProps = ComponentProps<'textarea'> & {
  /** grandit avec le texte, jusqu'à maxRows */ autoGrow?: boolean;
  maxRows?: number;
};

export function Textarea({
  className,
  id,
  autoGrow,
  maxRows = 12,
  rows = 3,
  onInput,
  ref: outerRef,
  ...props
}: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = 'auto';
    // monté caché (un groupe des Réglages pas encore ouvert) : rien à mesurer, `rows` garde sa hauteur
    if (el.scrollHeight === 0) return;
    el.style.height = `${Math.min(el.scrollHeight + 2, line * maxRows + 22)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: remesurer quand le texte ou le mode changent
  useLayoutEffect(grow, [props.value, autoGrow]);
  return (
    <textarea
      ref={mergeRefs(ref, outerRef)}
      rows={rows}
      className={cn(
        CONTROL,
        'block resize-none px-3 py-2.5 leading-[1.5]',
        !autoGrow && 'resize-y',
        className,
      )}
      onInput={(e) => {
        grow();
        onInput?.(e);
      }}
      {...useFieldProps(id)}
      {...props}
    />
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/** Liste déroulante Radix, au style des champs ; le menu est une feuille tenue au-dessus. */
export function Select({ options, placeholder, className, id, ...props }: SelectProps) {
  const field = useFieldProps(id);
  // Radix n'écrit le choix dans le champ qu'après l'hydratation : sans cela, le champ arrive vide du serveur.
  const [inner, setInner] = useState(props.defaultValue);
  const chosen = options.find((o) => o.value === (props.value ?? inner))?.label;
  return (
    <RSelect.Root
      {...props}
      onValueChange={(value) => {
        setInner(value);
        props.onValueChange?.(value);
      }}
    >
      <RSelect.Trigger
        {...field}
        aria-label={props['aria-label']}
        className={cn(
          CONTROL,
          'group flex h-10 items-center justify-between gap-2 px-3 text-left max-shell:h-11 data-[placeholder]:text-muted',
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder}>{chosen}</RSelect.Value>
        <RSelect.Icon>
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-fg-2 transition-transform duration-150 group-data-[state=open]:rotate-180"
          />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="layer-pop z-[70] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-float-line bg-menu p-1.5 shadow-float"
        >
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="flex h-[34px] cursor-pointer items-center gap-2.5 rounded-item px-2 text-ui text-fg outline-none select-none max-shell:h-11 data-[disabled]:opacity-50 data-[highlighted]:bg-hover data-[state=checked]:font-medium focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="ml-auto text-fg">
                  <Check aria-hidden="true" className="size-4" strokeWidth={2} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/** Case carrée de 16 px : cochée, elle se remplit d'encre. */
export function CheckboxBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border transition-[background-color,border-color] duration-150',
        checked ? 'border-ink bg-ink' : 'border-[var(--box-line)] bg-sheet',
      )}
    >
      <Check
        strokeWidth={2.6}
        className={cn(
          'size-[11px] text-on-ink transition-opacity duration-150',
          checked ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  );
}

export type CheckboxProps = Omit<
  ComponentProps<typeof RCheckbox.Root>,
  'children' | 'checked' | 'defaultChecked' | 'onCheckedChange'
> & {
  /** Contrôlé ; sans `checked`, la case garde son propre état (départ : defaultChecked). */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Libellé cliquable à droite */
  label?: ReactNode;
};

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  className,
  id,
  ...props
}: CheckboxProps) {
  const auto = useId();
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  const box = (
    <RCheckbox.Root
      id={id ?? auto}
      checked={on}
      onCheckedChange={(v) => {
        setOwn(v === true);
        onCheckedChange?.(v === true);
      }}
      // anneau : la règle globale :focus-visible (un `outline-none` ici l'effacerait aussi au focus, Tailwind 4)
      className={cn('rounded-[4px]', !label && className)}
      {...props}
    >
      <CheckboxBox checked={on} />
    </RCheckbox.Root>
  );
  if (!label) return box;
  return (
    <label
      htmlFor={id ?? auto}
      className={cn('inline-flex cursor-pointer items-center gap-2.5 text-ui text-fg', className)}
    >
      {box}
      {label}
    </label>
  );
}

export type SwitchProps = Omit<ComponentProps<typeof RSwitch.Root>, 'children'> & {
  label?: ReactNode;
};

export function Switch({ label, className, id, ...props }: SwitchProps) {
  const auto = useId();
  const sw = (
    <RSwitch.Root
      id={id ?? auto}
      className={cn(
        'group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-150 data-[state=checked]:bg-ink',
        !label && className,
      )}
      {...props}
    >
      <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-[var(--thumb)] transition-[translate,background-color] duration-150 ease-out group-data-[state=checked]:translate-x-[18px] group-data-[state=checked]:bg-on-ink" />
    </RSwitch.Root>
  );
  if (!label) return sw;
  return (
    <label
      htmlFor={id ?? auto}
      className={cn('inline-flex cursor-pointer items-center gap-2.5 text-ui text-fg', className)}
    >
      {sw}
      {label}
    </label>
  );
}
