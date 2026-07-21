"use client";

import { useEffect } from "react";
import "./globals.css";

// Catches errors thrown by the root layout itself, replacing it entirely — so
// it must define its own <html>/<body>. The per-segment src/app/(app)/error.tsx
// handles everything below the root layout; this is the last-resort boundary.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
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
            onClick={() => unstable_retry()}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
