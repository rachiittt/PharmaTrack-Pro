import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { Textarea } from './Field';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Accessible dialog (Esc to close, focus moved in and restored, scroll lock).
 * side="right" renders a drawer for record details.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', side, dismissable = true }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const target = panel.current?.querySelector('[data-autofocus], input:not([type=hidden]), select, textarea, button');
      (target || panel.current)?.focus();
    }, 0);
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;
  const drawer = side === 'right';
  return createPortal(
    <div className={`print-reset fixed inset-0 z-50 flex ${drawer ? 'justify-end' : 'items-end sm:items-center justify-center p-0 sm:p-4'}`}>
      <div className="absolute inset-0 bg-black/40" onClick={dismissable ? onClose : undefined} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`print-reset relative flex max-h-full w-full flex-col bg-surface shadow-pop focus:outline-none
          ${drawer ? 'h-full max-w-xl border-l border-line' : `${SIZES[size]} max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-line`}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
          </div>
          {dismissable && <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />}
        </header>
        <div className="print-reset flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation for consequential actions. With `requireReason`, the user must
 * explain (stored in the audit trail by the RPC).
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'danger', requireReason = false, reasonLabel = 'Reason' }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = !requireReason || reason.trim().length >= 3;
  async function confirm() {
    setBusy(true);
    try { await onConfirm(reason.trim()); setReason(''); } finally { setBusy(false); }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep it</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={!valid}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="space-y-4 text-sm text-ink-2">
        {children}
        {requireReason && (
          <Textarea label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
        )}
      </div>
    </Modal>
  );
}
