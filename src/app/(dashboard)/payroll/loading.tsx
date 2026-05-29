// Skeleton for /payroll. Title row + month picker + table of staff
// summary rows. Numeric columns are right-aligned in the real layout
// so the skeleton width matches the eventual content.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="h-9 w-36 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      <div className="mt-6 rounded-2xl ring-1 ring-border bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 border-b border-border last:border-b-0"
          >
            <div className="h-9 w-9 rounded-full bg-neutral-100 animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-24 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="h-5 w-20 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
