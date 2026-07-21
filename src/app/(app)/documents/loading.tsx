export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted/60" />
      <div className="h-40 rounded-md border border bg-card" />
      <div className="h-10 w-64 rounded-md bg-muted/60" />
      <div className="rounded-md border border bg-card">
        <div className="h-10 border-b bg-muted/40" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 border-b px-4 py-3">
            <div className="h-4 w-48 rounded bg-muted/60" />
            <div className="h-4 w-28 rounded bg-muted/60" />
            <div className="h-4 w-20 rounded bg-muted/60" />
            <div className="h-4 w-24 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
