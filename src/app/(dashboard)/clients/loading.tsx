// Skeleton shown while /clients server-renders. Mirrors the page's
// rough layout (title row + search box + table/card list) so the
// transition to the real content is visually quiet.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="hidden sm:block h-10 w-10 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      <div className="mt-4 h-10 w-full rounded-xl bg-neutral-100 animate-pulse" />
      <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-border bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-5 py-4 sm:px-6 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
              <div className="h-3 w-28 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="hidden sm:block h-4 w-32 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
