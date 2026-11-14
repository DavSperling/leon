// L'ossature : AppShell est monté par src/app/(app)/layout.tsx ; les écrans n'utilisent que usePalette.
export { AppShell, type AppShellProps } from './app-shell';
export { Brand, Logo } from './brand';
export { NAV, type NavItem, sectionOf } from './nav';
export { usePalette } from './palette-context';
export type { SidebarData } from './sidebar';
export { StandaloneShell } from './standalone';
export type { Viewer } from './workspace-menu';
