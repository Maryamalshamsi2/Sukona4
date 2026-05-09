// Skeleton for /expenses. Layout: title, filter row, petty-cash card,
// expense list. The bottom-right FAB on mobile isn't part of the
// skeleton — server-rendered pages mount it via the real component,
// not here.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-36 rounded bg-neutral-100 animate-pulse" />
        <div className="hidden sm:flex items-center gap-2">
          <div className="h-9 w-24 rounded-full bg-neutral-100 animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-neutral-100 animate-pulse" />
        </div>
      </div>
      {/* Petty cash card */}
      <div className="mt-6 rounded-2xl ring-1 ring-border bg-white p-4 sm:p-6">
        <div className="h-3 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="mt-2 h-7 w-28 rounded bg-neutral-100 animate-pulse" />
      </div>
      {/* List */}
      <div className="mt-6 rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-44 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-24 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
