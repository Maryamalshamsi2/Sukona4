export default function Loading() {
  return (
    <div>
      {/* Top toolbar skeleton: date nav + staff filter + add button */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 rounded-xl bg-neutral-100 animate-pulse" />
          <div className="h-9 w-9 rounded-xl bg-neutral-100 animate-pulse" />
          <div className="h-9 w-9 rounded-xl bg-neutral-100 animate-pulse" />
          <div className="h-9 w-32 rounded-xl bg-neutral-100 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-xl bg-neutral-100 animate-pulse" />
          <div className="h-9 w-9 rounded-xl bg-neutral-100 animate-pulse" />
        </div>
      </div>

      {/* Calendar grid skeleton: hour gutter + 3 staff columns */}
      <div className="rounded-2xl bg-white border border-[#EAEAEA] shadow-xs overflow-hidden">
        {/* Header row */}
        <div className="flex border-b border-neutral-100">
          <div className="w-16 shrink-0" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 border-l border-neutral-100 px-4 py-3">
              <div className="h-4 w-24 rounded bg-neutral-100 animate-pulse" />
            </div>
          ))}
        </div>
        {/* Body */}
        <div className="flex">
          {/* Hour labels */}
          <div className="w-16 shrink-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 border-b border-neutral-50 px-2 pt-1">
                <div className="h-3 w-8 rounded bg-neutral-100 animate-pulse" />
              </div>
            ))}
          </div>
          {/* Columns */}
          {[0, 1, 2].map((c) => (
            <div key={c} className="relative flex-1 border-l border-neutral-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 border-b border-neutral-50" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
