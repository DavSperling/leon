import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '@/lib/theme-cookie';

// Les trois thèmes, tels que le menu du compte et la palette (⌘K) les proposent.
export const THEME_CHOICES: Array<{ value: Theme; label: string; Icon: LucideIcon }> = [
  { value: 'clair', label: 'Clair', Icon: Sun },
  { value: 'sombre', label: 'Sombre', Icon: Moon },
  { value: 'systeme', label: 'Système', Icon: Monitor },
];
