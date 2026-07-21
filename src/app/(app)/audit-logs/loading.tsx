export default function AuditLogsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-md bg-muted/60" />
        <div className="h-4 w-96 rounded-md bg-muted" />
      </div>
      <section className="rounded-md border border bg-card">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 rounded-md bg-muted" />
          ))}
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid gap-4 md:grid-cols-5">
              <div className="h-4 rounded bg-muted" />
              <div className="h-4 rounded bg-muted" />
              <div className="h-4 rounded bg-muted" />
              <div className="h-4 rounded bg-muted" />
              <div className="h-4 rounded bg-muted" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
