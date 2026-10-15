'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PAGE_PARAMS } from '@/lib/tasks/task-links';
import { toViewParams, type ViewConfig } from '@/lib/tasks/view-config';

// L'adresse de la liste pour `config` : les seuls écarts à `base` (défaut d'équipe ou vue ouverte).
export function listHref(config: ViewConfig, base: ViewConfig, current: URLSearchParams): string {
  const params = toViewParams(config, base);
  for (const name of PAGE_PARAMS) {
    const value = current.get(name);
    if (value !== null) params.set(name, value);
  }
  const query = params.toString();
  return query === '' ? '/taches' : `/taches?${query}`;
}

// L'URL est la source de vérité de l'affichage : chaque changement est une navigation, et le
// retour arrière restaure l'affichage précédent.
export function useViewNavigation(base: ViewConfig): (config: ViewConfig) => void {
  const router = useRouter();
  const current = useSearchParams();
  return (config) => router.push(listHref(config, base, current));
}
