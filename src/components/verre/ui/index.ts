// Le kit de Leon, look « Papier » : importez tout depuis '@/components/verre'. Guide : KIT.md du portage.

export { Avatar, type AvatarProps, initialsOf, tintOf } from './avatar';
export { Badge, type BadgeProps, type Tone } from './badge';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  IconButton,
  type IconButtonProps,
} from './button';
export {
  CitationChip,
  NoSource,
  SourceChip,
  type SourceChipProps,
  SourceLink,
  SourceNumber,
  ToolIcon,
  ToolLogo,
} from './chips';
export { CodeLine, CopyButton } from './copy';
export {
  AlertDialog,
  type AlertDialogProps,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  type DialogContentProps,
  DialogFooter,
  DialogTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  type SheetContentProps,
  SheetTrigger,
} from './dialog';
export {
  EmptyState,
  type EmptyStateProps,
  Notice,
  type NoticeProps,
  type NoticeTone,
  PageSkeleton,
  Skeleton,
  SkeletonText,
} from './feedback';
export {
  Checkbox,
  CheckboxBox,
  type CheckboxProps,
  Field,
  type FieldProps,
  Input,
  Select,
  type SelectOption,
  type SelectProps,
  Switch,
  type SwitchProps,
  Textarea,
  type TextareaProps,
} from './form';
export { Kbd, useModKey } from './kbd';
export { PageHeader, type PageHeaderProps, Section, type SectionProps } from './layout';
export {
  DoneMark,
  Flag,
  type FlagProps,
  type FlagTone,
  Reading,
  Strokes,
  toneOf,
} from './marks';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from './menu';
export { OriginalSheet, type OriginalSheetProps } from './original-sheet';
export { Pagination, type PaginationProps } from './pagination';
export { Pill, type PillProps } from './pill';
export { SearchField, type SearchFieldProps } from './search-field';
export {
  Fact,
  Facts,
  PanelClose,
  PanelDone,
  PanelNote,
  SidePanel,
  type SidePanelConfirm,
  type SidePanelProps,
  StatusRow,
} from './side-panel';
export {
  Beam,
  type BeamProps,
  GlassCard,
  type GlassCardProps,
  Spotlight,
  trackSpot,
} from './surfaces';
export { CitedMarkdown, CitedText, Highlighted } from './text';
export { Thing, ThingGrid, type ThingGridProps, type ThingProps } from './thing';
export { Toaster, toast } from './toast';
