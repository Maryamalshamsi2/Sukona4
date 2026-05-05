export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-7">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl bg-white border border-[#EAEAEA] shadow-xs"
        >
          <div className="flex items-center justify-between p-6 sm:px-6">
            <div className="h-5 w-40 rounded bg-neutral-100 animate-pulse" />
            <div className="h-4 w-10 rounded bg-neutral-100 animate-pulse" />
          </div>
          <div>
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                className={`flex items-center gap-4 px-5 py-4 sm:px-6 ${
                  j > 0 ? "border-t border-gray-100/80" : ""
                }`}
              >
                <div className="w-[100px] shrink-0 sm:w-[110px]">
                  <div className="h-4 w-24 rounded bg-neutral-100 animate-pulse" />
                  <div className="mt-1.5 h-3 w-16 rounded bg-neutral-100 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
                  <div className="mt-1.5 h-3 w-48 rounded bg-neutral-100 animate-pulse" />
                </div>
                <div className="h-5 w-16 shrink-0 rounded-full bg-neutral-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
