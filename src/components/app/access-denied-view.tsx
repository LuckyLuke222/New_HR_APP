import Link from "next/link";
import { KushLogo } from "@/components/app/kush-logo";

export function AccessDeniedView() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <KushLogo iconOnly />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
