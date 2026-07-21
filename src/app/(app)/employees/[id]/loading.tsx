export default function EmployeeDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-md bg-muted/60" />
      <div className="rounded-md border border bg-card p-6 space-y-4">
        <div className="h-6 w-32 rounded bg-muted/60" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
