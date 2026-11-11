'use server';

import { redirect } from 'next/navigation';
import { authorizePath, parseAuthorizeParams, returnUrl } from '@/server/auth/computer-authorize';
import { signComputerCode } from '@/server/auth/computer-code';
import { getUserContext } from '@/server/auth/session';

// « Autoriser » et « Annuler » de /ordinateur/autoriser (K3). Le formulaire ne vaut rien : les paramètres sont
// revalidés ici, et l'utilisateur comme l'espace viennent de la session, jamais des champs. Seul « allow » signe un
// code ; toute autre décision, y compris absente, est un refus. Rien n'est journalisé : ni l'empreinte, ni l'etat,
// ni le code.
export async function authorizeComputerAction(formData: FormData): Promise<void> {
  const params = parseAuthorizeParams({
    port: formData.get('port'),
    etat: formData.get('etat'),
    empreinte: formData.get('empreinte'),
    usages: formData.get('usages'),
  });
  // La page dit pourquoi le lien ne vaut rien ; on ne renvoie jamais vers un port qu'on n'a pas validé.
  if (!params) redirect('/ordinateur/autoriser');
  if (formData.get('decision') !== 'allow') redirect(returnUrl(params, 'refus'));

  const ctx = await getUserContext();
  // Session perdue entre l'affichage et le clic : la page choisit entre la connexion et l'accueil.
  if (!ctx) redirect(authorizePath(params));
  // Les cases (T64, C16) : celles que la page montrait (`usages`, revalidé), et les cochées parmi elles.
  const shown = params.usages ?? [];
  const ticked = formData.getAll('usage');
  const code = signComputerCode({
    e: params.empreinte,
    u: ctx.userId,
    t: ctx.tenantId,
    m: shown,
    g: shown.filter((usage) => ticked.includes(usage)),
  });
  redirect(returnUrl(params, { code }));
}
