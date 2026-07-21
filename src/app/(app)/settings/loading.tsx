export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted/60" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="rounded-md border bg-card p-4">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted/60" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
