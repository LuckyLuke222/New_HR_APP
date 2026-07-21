export default function OnboardingAdminLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-md bg-muted/60" />
      <div className="rounded-md border border bg-card">
        <div className="border-b px-4 py-3">
          <div className="h-4 w-28 rounded bg-muted/60" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2 px-4 py-4">
              <div className="h-4 w-40 rounded bg-muted/60" />
              <div className="h-3 w-56 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
