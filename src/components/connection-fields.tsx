'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type ActionResult, inputTypeFor, resultMessage } from '@/lib/connection-form';
import { cn } from '@/lib/utils';
import type { CatalogField } from '@/server/connectors/catalog';

export const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-card px-2.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

// Un champ du formulaire d'un outil. Une clé n'est jamais préremplie ni réaffichée.
export function FieldInput({
  field,
  idPrefix,
  disabled,
}: {
  field: CatalogField;
  idPrefix: string;
  disabled?: boolean;
}) {
  const id = `${idPrefix}-${field.name}`;
  const type = inputTypeFor(field);
  const common = { id, name: field.name, disabled, placeholder: field.placeholder };
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{field.label}</Label>
      {type === 'textarea' && <Textarea {...common} rows={3} className="bg-card" />}
      {type === 'select' && (
        <select id={id} name={field.name} disabled={disabled} className={SELECT_CLASS}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {(type === 'text' || type === 'password') && (
        <Input
          {...common}
          type={type}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="bg-card"
        />
      )}
      {field.help && (
        <p className="text-[13px] leading-[18px] text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}

export function FormMessage({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  const failed = 'error' in result;
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={cn('text-[13px] leading-[18px]', failed ? 'text-destructive' : 'text-success')}
    >
      {resultMessage(result)}
    </p>
  );
}

// Les valeurs saisies, champ par champ ; seuls les champs demandés sont lus.
export function valuesOf(
  data: FormData,
  fields: ReadonlyArray<Pick<CatalogField, 'name'>>,
): Record<string, string> {
  return Object.fromEntries(fields.map(({ name }) => [name, String(data.get(name) ?? '')]));
}

// Envoi d'un formulaire de clé : le résultat reste affiché, la saisie est effacée après un succès.
export function useKeyForm(submit: (data: FormData) => Promise<ActionResult>) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const outcome = await submit(data);
        setResult(outcome);
        if ('ok' in outcome) form.reset();
      } catch {
        setResult({ error: 'Impossible de joindre le serveur. Réessayez.' });
      }
    });
  };
  return { result, pending, onSubmit };
}
