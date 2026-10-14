'use client';

import { TriangleAlert } from 'lucide-react';
import { useActionState, useId } from 'react';
import { createTokenAction } from '@/app/(app)/reglages/actions';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormState = { name: string; error?: string; token?: string };

async function createToken(_previous: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '');
  const result = await createTokenAction(name);
  return 'error' in result ? { name, error: result.error } : { name, token: result.token };
}

function NameForm({
  state,
  formAction,
  pending,
}: {
  state: FormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const id = useId();
  return (
    <form action={formAction} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Créer un jeton</DialogTitle>
        <DialogDescription>
          Un jeton donne accès à ce que vous voyez. Il n'est montré qu'une fois.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1">
        <Label htmlFor={id}>Nom de l'appareil</Label>
        <Input
          id={id}
          name="name"
          autoComplete="off"
          defaultValue={state.name}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className="bg-card"
        />
        {state.error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-[13px] leading-[18px] text-destructive"
          >
            {state.error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" size="sm">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Envoi…' : 'Créer le jeton'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatedToken({ token }: { token: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Jeton créé</DialogTitle>
        <DialogDescription>Collez-le dans l'outil à brancher.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <code className="block rounded-sm border bg-card p-3 font-mono text-xs leading-4 break-all select-all">
          {token}
        </code>
        <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-warning">
          <TriangleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
          Copiez-le maintenant : il ne sera plus affiché.
        </p>
      </div>
      <DialogFooter>
        <CopyButton text={token} />
        <DialogClose asChild>
          <Button size="sm">Terminé</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

// Le contenu du dialogue est démonté à la fermeture : le jeton disparaît avec lui.
function TokenFlow() {
  const [state, formAction, pending] = useActionState(createToken, { name: '' });
  if (state.token) return <CreatedToken token={state.token} />;
  return <NameForm state={state} formAction={formAction} pending={pending} />;
}

export function CreateTokenDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">Créer un jeton</Button>
      </DialogTrigger>
      {/* Pas de croix ni de fermeture au clic dehors : le jeton ne se retrouve pas. */}
      <DialogContent showCloseButton={false} onInteractOutside={(event) => event.preventDefault()}>
        <TokenFlow />
      </DialogContent>
    </Dialog>
  );
}
