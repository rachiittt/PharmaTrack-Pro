/** Bordered surface section. Use sparingly — pages are not a grid of cards. */
export function Panel({ title, description, actions, children, className = '', bodyClassName = '', padded = true, as: Tag = 'section' }) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`${padded ? 'p-4' : ''} ${bodyClassName}`}>{children}</div>
    </Tag>
  );
}

/** Definition list for record details. */
export function DetailList({ items, columns = 2 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {items.filter(Boolean).map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="eyebrow">{label}</dt>
          <dd className="mt-0.5 text-sm text-ink break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
