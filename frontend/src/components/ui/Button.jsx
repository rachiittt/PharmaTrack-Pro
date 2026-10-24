import { motion } from 'framer-motion';

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, loading, onClick, type = 'button', ...props }) {
  const variants = {
    primary: 'bg-[#0EA5E9] hover:bg-[#0284C7] text-white shadow-sm',
    secondary: 'bg-white dark:bg-surface-800 border border-[#E2E8F0] dark:border-surface-700 text-[#475569] dark:text-surface-300 hover:bg-[#F8FAFC] dark:hover:bg-surface-700',
    danger: 'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-sm',
    ghost: 'text-[#475569] dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
    outline: 'border border-[#0EA5E9] text-[#0EA5E9] hover:bg-accent-50 dark:hover:bg-accent-600/10',
    success: 'bg-[#22C55E] hover:bg-[#16a34a] text-white shadow-sm',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-sm',
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={!(disabled || loading) ? { scale: 0.97 } : {}}
      transition={{ duration: 0.1 }}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 font-heading
        ${variants[variant]} ${sizes[size]} 
        ${(disabled || loading) ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
