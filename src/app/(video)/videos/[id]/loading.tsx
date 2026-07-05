/** Skeleton for the watch page — player + up-next list. */
export default function WatchLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6 xl:flex-row">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-1">
        <div className="aspect-video w-full rounded-2xl bg-glass" />
        <div className="h-6 w-3/4 rounded-lg bg-glass" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-glass" />
          <div className="h-4 w-40 rounded bg-glass" />
        </div>
        <div className="h-20 w-full rounded-xl bg-glass" />
      </div>
      <div className="w-full shrink-0 space-y-3 xl:w-96">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-2.5">
            <div className="aspect-video w-40 rounded-xl bg-glass sm:w-44" />
            <div className="flex-1 space-y-2 pt-0.5">
              <div className="h-3.5 w-full rounded bg-glass" />
              <div className="h-3 w-1/2 rounded bg-glass" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
