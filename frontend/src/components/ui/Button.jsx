import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
  'danger-outline': 'border border-danger/40 text-danger hover:bg-danger-soft',
  soft: 'bg-primary-soft text-primary-ink hover:brightness-95',
};
const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
};

export function Button({
  variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, loading = false,
  className = '', children, type = 'button', disabled, ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed select-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={size === 'lg' ? 18 : 15} aria-hidden /> : Icon && <Icon size={size === 'lg' ? 18 : 15} aria-hidden />}
      {children}
      {IconRight && !loading && <IconRight size={15} aria-hidden />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', size = 16, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors disabled:opacity-40 ${className}`}
      {...props}
    >
      <Icon size={size} aria-hidden />
    </button>
  );
}
