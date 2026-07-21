import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerReviewForm } from "@/components/performance/performance-forms";
import { ReviewList } from "@/components/performance/performance-lists";
import { requireRole } from "@/lib/supabase/helpers";
import { resolvePerformanceTimeZone } from "@/lib/performance-deadline";
import { getAppTimezoneAsAdmin } from "@/server/dal/app-settings";
import {
  getActiveOrVisibleCycles,
  getPerformanceCycles,
  getPerformanceEmployees,
  getPerformanceReviews,
} from "@/server/dal/performance";

export default async function PerformanceReviewsPage() {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "/performance/reviews",
  });

  const [employeesResult, cyclesResult, allCyclesResult, reviewsResult, configuredTimeZone] =
    await Promise.all([
      getPerformanceEmployees(user.role, user.id),
      getActiveOrVisibleCycles(),
      getPerformanceCycles(),
      getPerformanceReviews(),
      getAppTimezoneAsAdmin(),
    ]);
  const businessTimeZone = resolvePerformanceTimeZone(configuredTimeZone);

  const errors = [
    employeesResult.error,
    cyclesResult.error,
    allCyclesResult.error,
    reviewsResult.error,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Performance reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit 1-5 manager appraisals with strengths, improvements, and next steps.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/performance">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to performance
          </Link>
        </Button>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Some review data could not be loaded. {errors[0]}
        </div>
      )}

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Submit appraisal</h2>
        </div>
        <div className="p-4">
          <ManagerReviewForm
            employees={employeesResult.employees}
            cycles={cyclesResult.cycles}
            businessTimeZone={businessTimeZone}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Reviews in scope</h2>
        </div>
        <ReviewList
          reviews={reviewsResult.reviews}
          showEmployee
          canSelfReview={false}
          cycles={allCyclesResult.cycles}
          businessTimeZone={businessTimeZone}
        />
      </section>
    </div>
  );
}
