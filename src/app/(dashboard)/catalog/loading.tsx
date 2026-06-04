// Skeleton for /catalog. Title row + category tabs + a grid of
// service/bundle cards. The real page mixes services + bundles in
// the same flow; the skeleton just shows generic card shapes.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-28 rounded bg-neutral-100 animate-pulse" />
        <div className="h-9 w-9 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      {/* Category tabs */}
      <div className="mt-4 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-neutral-100 animate-pulse" />
        ))}
      </div>
      {/* Service/bundle cards — 1 col on mobile, 2 on desktop */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl ring-1 ring-border bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
                <div className="h-3 w-28 rounded bg-neutral-100 animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
