export default function OnboardingLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="h-8 w-40 rounded-md bg-muted/60" />
      <div className="h-4 w-64 rounded-md bg-muted" />
      <div className="rounded-md border border bg-card">
        <div className="border-b px-4 py-3">
          <div className="h-4 w-32 rounded bg-muted/60" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-32 rounded bg-muted/60" />
              <div className="h-2 w-32 rounded-full bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border border bg-card">
        <div className="border-b px-4 py-3">
          <div className="h-4 w-24 rounded bg-muted/60" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-48 rounded bg-muted/60" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
