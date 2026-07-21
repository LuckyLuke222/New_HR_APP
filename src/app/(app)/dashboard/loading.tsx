export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-muted/60" />
        <div className="h-4 w-80 rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border border bg-card p-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-3 h-8 w-16 rounded bg-muted/60" />
            <div className="mt-2 h-3 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-md border border bg-card p-4">
            <div className="h-4 w-36 rounded bg-muted/60" />
            <div className="mt-4 space-y-3">
              <div className="h-4 rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
