export default function PerformanceReviewsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-96 animate-pulse rounded-md border border bg-card" />
      <div className="h-72 animate-pulse rounded-md border border bg-card" />
    </div>
  );
}
