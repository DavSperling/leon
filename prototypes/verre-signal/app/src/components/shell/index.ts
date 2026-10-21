// L'ossature : AppShell est monté par le routeur ; les écrans n'utilisent que useThinking, usePalette et useShell.
export { AppShell } from './app-shell';
export { Aurora, ThinkingProvider, useThinking } from './thinking';
export { usePalette } from './palette-context';
export { useShell } from './shell-kind';
export { Logo, Brand } from './brand';
export { StandaloneShell } from './standalone';
export { NAV, sectionOf, type NavItem } from './nav';
