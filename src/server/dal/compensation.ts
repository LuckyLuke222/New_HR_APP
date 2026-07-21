import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeDalError } from "@/server/dal/errors";

export type PayFrequency = "monthly" | "weekly" | "hourly";

export type CompensationRow = {
  id: string | null;
  employeeId: string;
  salaryAmount: number | null;
  salaryCurrency: string;
  payFrequency: PayFrequency | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  taxId: string | null;
  nationalId: string | null;
  passportNumber: string | null;
  nationality: string | null;
  effectiveDate: string | null;
  notes: string | null;
  updatedAt: string | null;
};

export type CompensationSummary = {
  salaryAmount: number | null;
  salaryCurrency: string;
  payFrequency: PayFrequency | null;
  effectiveDate: string | null;
};

export type DirectReportCompensationSummary = {
  employeeId: string;
  employeeName: string;
  summary: CompensationSummary | null;
};

export type ManagerVisibleCompensation = {
  ownSummary: CompensationSummary | null;
  directReports: DirectReportCompensationSummary[];
};

// Admin: fetch all compensation fields for one employee.
export async function getCompensation(
  employeeId: string,
): Promise<{ compensation: CompensationRow | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_compensation")
    .select(
      "id, employee_id, salary_amount, salary_currency, pay_frequency, bank_name, bank_account_holder, bank_account_number, tax_id, national_id, passport_number, nationality, effective_date, notes, updated_at",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) return { compensation: null, error: safeDalError("compensation.getCompensation", error, "Unable to load compensation.") };
  if (!data) return { compensation: null, error: null };

  return { compensation: rowToCompensation(data), error: null };
}

// Employee self-edit form needs the full row (salary read-only display + non-salary editable).
// Caller must pass user.id from the authenticated session — never accept a searchParam-supplied id.
export async function getOwnCompensationForSelfEdit(
  employeeId: string,
): Promise<{ compensation: CompensationRow | null; error: string | null }> {
  return getCompensation(employeeId);
}

// Summary projection for an arbitrary employee id, fetched via service-role.
// Consumers: the employee dashboard (own summary) and the manager `/payroll`
// view as the `ownSummary` half of `getManagerVisibleCompensation`. NOT used
// for the manager's direct-report scope — that goes through the RPC.
export async function getCompensationSummary(
  employeeId: string,
): Promise<{ summary: CompensationSummary | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_compensation")
    .select("salary_amount, salary_currency, pay_frequency, effective_date")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) return { summary: null, error: safeDalError("compensation.getCompensationSummary", error, "Unable to load compensation summary.") };
  if (!data) return { summary: null, error: null };

  return {
    summary: {
      salaryAmount: data.salary_amount as number | null,
      salaryCurrency: (data.salary_currency as string) ?? "USD",
      payFrequency: data.pay_frequency as PayFrequency | null,
      effectiveDate: data.effective_date as string | null,
    },
    error: null,
  };
}

// Manager scope: own summary + direct-report summaries. Reads through the
// SECURITY DEFINER RPC `get_direct_report_compensation_summaries` (migration
// 0050) so the row+column projection is enforced at the DB layer. The RPC is
// called via the *session* client so `auth.uid()` inside the function
// resolves to the manager; if we used service-role here the WHERE clause
// would never match a real user.
export async function getManagerVisibleCompensation(
  managerId: string,
): Promise<{ data: ManagerVisibleCompensation; error: string | null }> {
  const sb = await createClient();

  // Own-summary half uses the service-role admin client inside
  // `getCompensationSummary` because we already trust the explicit `managerId`
  // (passed from `requireRole`-validated page state). The RPC half uses the
  // session client so `auth.uid()` inside the SECURITY DEFINER body resolves
  // to the manager and the direct-report WHERE clause filters correctly.
  const [{ summary: ownSummary, error: ownErr }, reportsResult] = await Promise.all([
    getCompensationSummary(managerId),
    sb.rpc("get_direct_report_compensation_summaries"),
  ]);

  if (reportsResult.error) {
    return {
      data: { ownSummary, directReports: [] },
      error:
        ownErr ??
        safeDalError(
          "compensation.getManagerVisibleCompensation.rpc",
          reportsResult.error,
          "Unable to load direct-report compensation.",
        ),
    };
  }

  const rows = (reportsResult.data ?? []) as Array<Record<string, unknown>>;
  const directReports: DirectReportCompensationSummary[] = rows.map(
    (row): DirectReportCompensationSummary => {
      // Migration 0051: direct reports without an employee_compensation row
      // come through with all comp fields null (LEFT JOIN). A real comp row
      // always has a currency (defaulted to 'USD' on insert), so null
      // currency is the signal that the row is missing.
      const hasCompensationRow = row.salary_currency != null;
      return {
        employeeId: row.employee_id as string,
        employeeName: (row.employee_name as string) ?? "Unknown",
        summary: hasCompensationRow
          ? {
              salaryAmount: row.salary_amount as number | null,
              salaryCurrency: (row.salary_currency as string) ?? "USD",
              payFrequency: row.pay_frequency as PayFrequency | null,
              effectiveDate: row.effective_date as string | null,
            }
          : null,
      };
    },
  );

  return {
    data: { ownSummary, directReports },
    error: ownErr,
  };
}

function rowToCompensation(data: Record<string, unknown>): CompensationRow {
  return {
    id: data.id as string,
    employeeId: data.employee_id as string,
    salaryAmount: data.salary_amount as number | null,
    salaryCurrency: (data.salary_currency as string) ?? "USD",
    payFrequency: data.pay_frequency as PayFrequency | null,
    bankName: data.bank_name as string | null,
    bankAccountHolder: data.bank_account_holder as string | null,
    bankAccountNumber: data.bank_account_number as string | null,
    taxId: data.tax_id as string | null,
    nationalId: data.national_id as string | null,
    passportNumber: data.passport_number as string | null,
    nationality: data.nationality as string | null,
    effectiveDate: data.effective_date as string | null,
    notes: data.notes as string | null,
    updatedAt: data.updated_at as string,
  };
}
