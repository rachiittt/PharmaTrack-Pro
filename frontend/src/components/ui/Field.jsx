import { useId } from 'react';

const control = `w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3
  transition-colors hover:border-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
  disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger`;

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, required, children, className = '', id: idProp }) {
  const generated = useId();
  const id = idProp || generated;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error ? <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, hint, error, required, className = '', inputClassName = '', prefix, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={props.id}>
      {(a11y) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-sm">{prefix}</span>}
          <input {...a11y} {...props} className={`${control} h-9 ${prefix ? 'pl-7' : ''} ${inputClassName}`} />
        </div>
      )}
    </Field>
  );
}

export function Select({ label, hint, error, required, className = '', options = [], placeholder, children, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={props.id}>
      {(a11y) => (
        <select {...a11y} {...props} className={`${control} h-9 pr-8`}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>))}
          {children}
        </select>
      )}
    </Field>
  );
}

export function Textarea({ label, hint, error, required, className = '', rows = 3, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={props.id}>
      {(a11y) => <textarea {...a11y} rows={rows} {...props} className={`${control} py-2 leading-snug`} />}
    </Field>
  );
}

/** Unlabelled compact input for toolbars and table cells. */
export function BareInput({ className = '', ...props }) {
  return <input {...props} className={`${control} h-9 ${className}`} />;
}

export function BareSelect({ className = '', options = [], ...props }) {
  return (
    <select {...props} className={`${control} h-9 pr-8 ${className}`}>
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Checkbox({ label, description, className = '', ...props }) {
  return (
    <label className={`flex items-start gap-2.5 cursor-pointer ${className}`}>
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--primary)]" />
      <span>
        <span className="text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}
