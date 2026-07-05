/** Skeleton shown while a drive folder's data streams in. */
export default function DriveLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Chargement">
      <div className="h-5 w-40 animate-pulse rounded-lg bg-glass" />
      <div className="flex items-center justify-between gap-3">
        <div className="h-10 w-full max-w-xs animate-pulse rounded-lg bg-glass" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-glass" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="glass flex flex-col gap-3 rounded-xl p-3.5">
            <div className="h-20 animate-pulse rounded-lg bg-bg-1/60" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-glass" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-glass" />
          </div>
        ))}
      </div>
    </div>
  );
}
