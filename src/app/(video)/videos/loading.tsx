/** Skeleton for the video hub while the server streams the list. */
export default function VideosLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-8 w-40 rounded-lg bg-glass" />
      <div className="h-11 w-full max-w-xl rounded-full bg-glass" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-glass" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="aspect-video w-full rounded-xl bg-glass" />
            <div className="flex gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-glass" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-full rounded bg-glass" />
                <div className="h-3 w-2/3 rounded bg-glass" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
