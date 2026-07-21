import { requireRole } from "@/lib/supabase/helpers";
import {
  getCompensation,
  getManagerVisibleCompensation,
  getOwnCompensationForSelfEdit,
  type CompensationSummary,
} from "@/server/dal/compensation";
import { getAllEmployeeOptions } from "@/server/dal/employees";
import { CompensationForm } from "@/components/payroll/compensation-form";
import { SearchableSelectField } from "@/components/ui/searchable-select";

type PageProps = {
  searchParams: Promise<{ employeeId?: string; employeeIdSearch?: string }>;
};

const PAY_FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  hourly: "Hourly",
};

export default async function PayrollPage({ searchParams }: PageProps) {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/payroll",
  });

  // ─── Employee view ────────────────────────────────────────────────────────────
  if (user.role === "employee") {
    const { compensation } = await getOwnCompensationForSelfEdit(user.id);

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">My payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update your bank, tax, and identification details. Salary and pay frequency are managed by an admin.
          </p>
        </div>

        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">My details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bank account number is masked on screen. Enter a new value to update it.
            </p>
          </div>
          <div className="p-4">
            {compensation ? (
              <CompensationForm
                employeeId={user.id}
                compensation={compensation}
                mode="employee-self"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No compensation record on file. Ask an admin to set up your record first.
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ─── Manager view ─────────────────────────────────────────────────────────────
  if (user.role === "manager") {
    const { data } = await getManagerVisibleCompensation(user.id);

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your own salary summary and a read-only view of your direct reports&apos; pay summaries. Bank and tax details are visible only to admin and the employee themselves.
          </p>
        </div>

        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">My compensation</h2>
          </div>
          <div className="p-4">
            <SummaryReadOnly summary={data.ownSummary} />
          </div>
        </section>

        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Direct reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salary, currency, pay frequency, and effective date only. No bank, tax, or identification fields.
            </p>
          </div>
          <div className="p-4">
            {data.directReports.length === 0 ? (
              <div className="rounded-md border bg-muted/40 p-6 text-center">
                <p className="text-sm font-medium text-foreground">No direct reports on file.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Direct reports assigned to you will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Salary</th>
                      <th className="px-3 py-2 text-left font-medium">Pay frequency</th>
                      <th className="px-3 py-2 text-left font-medium">Effective date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.directReports.map((row) => (
                      <tr key={row.employeeId} className="border-t">
                        <td className="px-3 py-2 font-medium text-foreground">{row.employeeName}</td>
                        <td className="px-3 py-2">{formatSalary(row.summary)}</td>
                        <td className="px-3 py-2">{formatFrequency(row.summary)}</td>
                        <td className="px-3 py-2">{row.summary?.effectiveDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ─── Admin view ───────────────────────────────────────────────────────────────
  const params = await searchParams;
  const { employees } = await getAllEmployeeOptions();
  const selectedEmployeeId = resolveSelectedEmployeeId({
    employees,
    employeeId: params.employeeId,
    employeeSearch: params.employeeIdSearch,
  });
  const { compensation } = selectedEmployeeId
    ? await getCompensation(selectedEmployeeId)
    : { compensation: null };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage employee compensation records.
        </p>
      </div>

      {/* Employee picker */}
      <form action="/payroll" className="flex items-start gap-3">
        <div className="flex-1">
          <SearchableSelectField
            id="employeeId"
            name="employeeId"
            label="Employee"
            options={employees.map((employee) => ({
              value: employee.id,
              label: employee.label,
            }))}
            defaultValue={selectedEmployeeId}
            emptyLabel="Select an employee"
            placeholder="Search employee"
            required
          />
        </div>
        <button
          type="submit"
          className="mt-[1.625rem] h-10 rounded-md border border-input bg-transparent px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Load
        </button>
      </form>

      {selectedEmployeeId ? (
        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Compensation record</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bank account number is masked on screen. Enter a new value to update it.
            </p>
          </div>
          <div className="p-4">
            <CompensationForm employeeId={selectedEmployeeId} compensation={compensation} />
          </div>
        </section>
      ) : (
        <div className="rounded-md border bg-card p-8 text-card-foreground shadow text-center">
          <p className="text-sm text-muted-foreground">Select an employee above to view or edit their compensation.</p>
        </div>
      )}
    </div>
  );
}

function SummaryReadOnly({ summary }: { summary: CompensationSummary | null }) {
  if (!summary) {
    return <p className="text-sm text-muted-foreground">No compensation record on file.</p>;
  }
  return (
    <dl className="grid gap-4 sm:grid-cols-3 text-sm">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Salary</dt>
        <dd className="mt-1 text-base font-semibold text-foreground">
          {summary.salaryAmount != null
            ? `${summary.salaryCurrency} ${summary.salaryAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`
            : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pay frequency</dt>
        <dd className="mt-1 text-base font-semibold text-foreground">
          {summary.payFrequency ? PAY_FREQUENCY_LABELS[summary.payFrequency] : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Effective date</dt>
        <dd className="mt-1 text-base font-semibold text-foreground">{summary.effectiveDate ?? "—"}</dd>
      </div>
    </dl>
  );
}

function formatSalary(summary: CompensationSummary | null): string {
  if (!summary || summary.salaryAmount == null) return "—";
  return `${summary.salaryCurrency} ${summary.salaryAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`;
}

function formatFrequency(summary: CompensationSummary | null): string {
  if (!summary?.payFrequency) return "—";
  return PAY_FREQUENCY_LABELS[summary.payFrequency] ?? summary.payFrequency;
}

function resolveSelectedEmployeeId({
  employees,
  employeeId,
  employeeSearch,
}: {
  employees: Array<{ id: string; label: string }>;
  employeeId?: string;
  employeeSearch?: string;
}): string {
  if (employeeId && employees.some((employee) => employee.id === employeeId)) {
    return employeeId;
  }

  const search = employeeSearch?.trim().toLowerCase();
  if (!search) return "";

  const exact = employees.find((employee) => employee.label.toLowerCase() === search);
  const partial = employees.find((employee) =>
    employee.label.toLowerCase().includes(search),
  );
  return (exact ?? partial)?.id ?? "";
}
