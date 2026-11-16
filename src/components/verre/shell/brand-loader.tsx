import { Logo } from './brand';

/** L'indicateur plein écran pendant une navigation ou le chargement d'une page. */
export function BrandLoader({
  label,
  transition = false,
}: {
  label: string;
  transition?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`leon-loader${transition ? ' leon-loader--transition' : ''}`}
    >
      <span className="sr-only">{label}</span>
      <Logo className="size-20 leon-loader__mark" />
    </div>
  );
}
