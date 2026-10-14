'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { revokeTokenAction } from '@/app/(app)/reglages/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function RevokeTokenButton({ tokenId, name }: { tokenId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  const revoke = () =>
    startTransition(async () => {
      try {
        const { ok } = await revokeTokenAction(tokenId);
        if (ok) toast.success('Jeton révoqué.');
        else toast.error("Ce jeton n'existe plus ou est déjà révoqué.");
      } catch {
        toast.error('Impossible de révoquer. Réessayez.');
      }
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          {pending ? 'Envoi…' : 'Révoquer'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Révoquer «&nbsp;{name}&nbsp;» ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les outils qui l'utilisent perdront l'accès.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke}>
            Révoquer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
