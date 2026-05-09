// Skeleton for /reports. Layout: title row + filter, tab strip, then
// stat cards / list rows for the active tab. We don't know which tab
// is active server-side, so the skeleton shows a generic stat row +
// list layout that fits any of them.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="h-9 w-32 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      {/* Tab strip */}
      <div className="mt-4 flex gap-1 rounded-xl bg-surface-active p-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 flex-1 rounded-lg bg-neutral-100 animate-pulse" />
        ))}
      </div>
      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl ring-1 ring-border bg-white p-4">
            <div className="h-3 w-16 rounded bg-neutral-100 animate-pulse" />
            <div className="mt-2 h-7 w-20 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
      {/* List */}
      <div className="mt-6 rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-32 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
