import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireRole } from "@/lib/supabase/helpers";
import { getTemplates, getAssignableEmployees } from "@/server/dal/onboarding";
import { TemplatePanel } from "@/components/onboarding/template-panel";
import { AssignTasksForm } from "@/components/onboarding/assign-tasks-form";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

export default async function OnboardingAdminPage() {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "/onboarding/admin",
  });

  const [{ templates, error: templatesError }, { employees, error: employeesError }] =
    await Promise.all([
      getTemplates(),
      getAssignableEmployees(user.role, user.id),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Onboarding
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-normal">
          {user.role === "admin" ? "Onboarding admin" : "Assign tasks"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.role === "admin"
            ? "Manage reusable task templates and assign onboarding tasks to employees."
            : "Assign onboarding tasks to your direct reports."}
        </p>
      </div>

      {/* Assign tasks — visible to both admin and manager */}
      {employeesError ? (
        <Alert variant="destructive">
          <AlertDescription>Unable to load employees. {employeesError}</AlertDescription>
        </Alert>
      ) : templatesError ? (
        <Alert variant="destructive">
          <AlertDescription>Unable to load templates. {templatesError}</AlertDescription>
        </Alert>
      ) : (
        <CollapsibleSection title="Assign tasks" id="assign-tasks-panel">
          <AssignTasksForm
            employees={employees}
            templates={templates.filter((t) => t.isActive)}
          />
        </CollapsibleSection>
      )}

      {/* Template management — admin only */}
      {user.role === "admin" && (
        <CollapsibleSection title="Templates" id="templates-panel">
          {templatesError ? (
            <Alert variant="destructive">
              <AlertDescription>Unable to load templates. {templatesError}</AlertDescription>
            </Alert>
          ) : (
            <TemplatePanel templates={templates} />
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
