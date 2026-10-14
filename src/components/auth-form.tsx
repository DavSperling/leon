'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import type { AuthFormState } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AuthField = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: string;
};

type FieldProps = { field: AuthField; error?: string; defaultValue?: string };

function Field({ field, error, defaultValue }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = field.type === 'password';
  const describedBy = [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{field.label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={field.name}
          type={isPassword && visible ? 'text' : field.type}
          autoComplete={field.autoComplete}
          defaultValue={defaultValue}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy.join(' ') || undefined}
          className={isPassword ? 'bg-card pr-16' : 'bg-card'}
        />
        {isPassword && (
          <button
            type="button"
            aria-controls={id}
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 px-3 text-[13px] text-primary hover:underline"
          >
            {visible ? 'Masquer' : 'Voir'}
          </button>
        )}
      </div>
      {field.hint && (
        <p id={`${id}-hint`} className="text-[13px] leading-[18px] text-muted-foreground">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] leading-[18px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type AuthFormProps = {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: AuthField[];
  submitLabel: string;
};

// Formulaire de connexion ou d'inscription : erreurs sous les champs, focus sur le premier en erreur.
export function AuthForm({ action, fields, submitLabel }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state.errors]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          error={state.errors?.[field.name]}
          defaultValue={state.values?.[field.name]}
        />
      ))}
      {state.errors?.form && (
        <p
          role="alert"
          className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] leading-[18px] text-destructive"
        >
          {state.errors.form}
        </p>
      )}
      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? 'Envoi…' : submitLabel}
      </Button>
    </form>
  );
}
