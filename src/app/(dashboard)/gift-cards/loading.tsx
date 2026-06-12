// Skeleton for /gift-cards. Title + summary card + list of cards.
// Matches the silhouette of the loaded view so there's no layout
// shift when the data resolves.
export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-neutral-100 animate-pulse" />
        <div className="h-9 w-9 rounded-full bg-neutral-100 animate-pulse" />
      </div>
      <div className="mt-6 h-16 rounded-2xl bg-neutral-100 animate-pulse" />
      <div className="mt-4 rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-44 rounded bg-neutral-100 animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 rounded bg-neutral-100 animate-pulse" />
                <div className="h-4 w-14 rounded-full bg-neutral-100 animate-pulse" />
              </div>
            </div>
            <div className="h-5 w-20 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
