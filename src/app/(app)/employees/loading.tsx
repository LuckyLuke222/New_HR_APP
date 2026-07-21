export default function EmployeesLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/60" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="rounded-md border border bg-card">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_auto]">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
