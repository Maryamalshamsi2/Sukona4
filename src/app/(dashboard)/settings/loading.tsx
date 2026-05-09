// Skeleton for /settings. Layout: title, tab strip, form fields.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
      {/* Tab strip */}
      <div className="flex gap-1 rounded-xl bg-surface-active p-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 flex-1 rounded-lg bg-neutral-100 animate-pulse" />
        ))}
      </div>
      {/* Form fields */}
      <div className="space-y-5 rounded-2xl ring-1 ring-border bg-white p-5 sm:p-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-neutral-100 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-neutral-100 animate-pulse" />
          </div>
        ))}
        <div className="h-10 w-28 rounded-xl bg-neutral-100 animate-pulse" />
      </div>
    </div>
  );
}
