// Skeleton for /inventory. Layout: title row, filter pills, list of
// item cards.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="hidden sm:block h-10 w-10 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      {/* Filter pills */}
      <div className="mt-6 flex gap-2 overflow-hidden">
        {[64, 84, 76, 70].map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-9 rounded-full bg-neutral-100 animate-pulse"
          />
        ))}
      </div>
      {/* Item rows */}
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl ring-1 ring-border bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
                <div className="h-3 w-28 rounded bg-neutral-100 animate-pulse" />
              </div>
              <div className="h-9 w-24 rounded-lg bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
