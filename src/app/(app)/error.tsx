"use client";

import { useEffect } from "react";
import { AccessDeniedView } from "@/components/app/access-denied-view";
import { ACCESS_DENIED_DIGEST } from "@/lib/supabase/access-denied-digest";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const isAccessDenied = error.digest === ACCESS_DENIED_DIGEST;

  useEffect(() => {
    if (!isAccessDenied) console.error(error);
  }, [error, isAccessDenied]);

  if (isAccessDenied) {
    return <AccessDeniedView />;
  }

  return (
    <div className="mx-auto max-w-7xl py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        An unexpected error occurred. Please try again.
        {error.digest && (
          <span className="ml-1 font-mono text-xs text-muted-foreground/70">
            (ref: {error.digest})
          </span>
        )}
      </p>
      <button
        onClick={unstable_retry}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
