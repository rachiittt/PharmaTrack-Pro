export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-surface-100 dark:bg-surface-800 rounded-md ${className}`} />;
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 bg-surface-50 dark:bg-surface-900 border-b border-[#E2E8F0] dark:border-surface-700 flex gap-6">
        {[40, 25, 15, 20].map((w, i) => (
          <Skeleton key={i} className={`h-3`} style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array(rows).fill(0).map((_, r) => (
        <div key={r} className="px-6 py-4 border-b border-[#E2E8F0] dark:border-surface-700 last:border-0 flex gap-6 items-center">
          <Skeleton className="h-4" style={{ width: '35%' }} />
          <Skeleton className="h-4" style={{ width: '20%' }} />
          <Skeleton className="h-4" style={{ width: '15%' }} />
          <Skeleton className="h-4" style={{ width: '20%' }} />
          <Skeleton className="h-6 w-16 rounded-md" style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-6">
      <div className="flex items-start gap-4 mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <Skeleton className="h-2 w-full mt-4" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="card p-6">
      <Skeleton className="h-5 w-40 mb-2" />
      <Skeleton className="h-3 w-56 mb-6" />
      <div className="flex items-end gap-2 h-[200px]">
        {[60, 80, 45, 90, 70, 55, 85, 40, 75, 65, 88, 50].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
