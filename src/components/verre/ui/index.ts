// Le système de design Leon « Verre + signal » : importez tout depuis '@/components/verre'.

export { Badge, type BadgeProps, type Tone } from './badge';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  IconButton,
  type IconButtonProps,
} from './button';
export { CitationChip, SourceChip, type SourceChipProps, SourceLink, ToolIcon } from './chips';
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
export { Pagination, type PaginationProps } from './pagination';
export { Pill, type PillProps } from './pill';
export {
  Beam,
  type BeamProps,
  GlassCard,
  type GlassCardProps,
  Spotlight,
  trackSpot,
} from './surfaces';
export { CitedText, Highlighted } from './text';
export { Toaster, toast } from './toast';
