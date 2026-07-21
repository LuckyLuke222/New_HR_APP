export default function DepartmentsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-md bg-muted/60" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="rounded-md border border bg-card p-4">
        <div className="h-5 w-36 animate-pulse rounded-md bg-muted/60" />
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="rounded-md border border bg-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
