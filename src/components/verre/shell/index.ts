// L'ossature : AppShell est monté par src/app/(app)/layout.tsx ; les écrans n'utilisent que useThinking, usePalette et useShell.
export { AppShell, type AppShellProps } from './app-shell';
export { Brand, Logo } from './brand';
export { NAV, type NavItem, sectionOf } from './nav';
export { usePalette } from './palette-context';
export { useShell } from './shell-kind';
export { StandaloneShell } from './standalone';
export { Aurora, ThinkingProvider, useThinking } from './thinking';
export type { Viewer } from './workspace-menu';
