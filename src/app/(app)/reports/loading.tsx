export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted/60" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-9 w-32 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>
      <div className="rounded-md border bg-card p-4">
        <div className="h-5 w-44 animate-pulse rounded-md bg-muted/60" />
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}
