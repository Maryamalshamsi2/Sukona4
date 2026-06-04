// Skeleton for /team. Title row + add button + group tabs + list of
// member rows. Owner is the only role here that actually creates
// new members, so the layout is the same regardless of who's loading.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-24 rounded bg-neutral-100 animate-pulse" />
        <div className="h-9 w-9 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      {/* Group tabs */}
      <div className="mt-4 flex gap-2 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-neutral-100 animate-pulse" />
        ))}
      </div>
      {/* Member rows */}
      <div className="mt-6 rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
            <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-100 animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-28 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="h-5 w-12 rounded-full bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
