export default function LeaveLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="h-8 w-24 animate-pulse rounded-md bg-muted/60" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-md border border bg-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-md border border bg-muted" />
    </div>
  );
}
