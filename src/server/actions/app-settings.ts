"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidIanaTimeZone } from "@/lib/performance-deadline";
import { insertAuditLog } from "@/server/audit";
import { getAppSettingsAsAdmin } from "@/server/dal/app-settings";

export type AppSettingsActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedAppSettingsValues;
};

export type SubmittedAppSettingsValues = {
  companyName?: string;
  companyAddress?: string;
  companyLogoUrl?: string;
  localLeaveDefaultDays?: string;
  sickLeaveDefaultDays?: string;
  workingDays?: string[];
  timezone?: string;
  currency?: string;
};

const WORKING_DAY_VALUES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const AppSettingsSchema = z.object({
  companyName: z.string().trim().max(200, "Company name must be 200 characters or fewer."),
  companyAddress: z.string().trim().max(500, "Company address must be 500 characters or fewer."),
  companyLogoUrl: z
    .string()
    .trim()
    .max(500, "Logo URL must be 500 characters or fewer.")
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "Logo URL must start with http:// or https://.",
    ),
  localLeaveDefaultDays: z.coerce
    .number()
    .int("Local Leave default must be a whole number.")
    .min(0, "Local Leave default cannot be negative.")
    .max(365, "Local Leave default cannot exceed 365."),
  sickLeaveDefaultDays: z.coerce
    .number()
    .int("Sick Leave default must be a whole number.")
    .min(0, "Sick Leave default cannot be negative.")
    .max(365, "Sick Leave default cannot exceed 365."),
  workingDays: z
    .array(z.enum(WORKING_DAY_VALUES))
    .min(1, "Select at least one working day.")
    .max(7),
  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required.")
    .max(64, "Timezone must be 64 characters or fewer.")
    .refine(isValidIanaTimeZone, "Timezone must be a valid IANA timezone."),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. MUR)."),
});

function readSubmitted(formData: FormData): SubmittedAppSettingsValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  const days = formData.getAll("workingDays").filter((v): v is string => typeof v === "string");
  return {
    companyName: get("companyName"),
    companyAddress: get("companyAddress"),
    companyLogoUrl: get("companyLogoUrl"),
    localLeaveDefaultDays: get("localLeaveDefaultDays"),
    sickLeaveDefaultDays: get("sickLeaveDefaultDays"),
    workingDays: days,
    timezone: get("timezone"),
    currency: get("currency"),
  };
}

export async function updateAppSettings(
  _previous: AppSettingsActionState,
  formData: FormData,
): Promise<AppSettingsActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "/settings" });
  const submitted = readSubmitted(formData);

  const parsed = AppSettingsSchema.safeParse({
    companyName: submitted.companyName ?? "",
    companyAddress: submitted.companyAddress ?? "",
    companyLogoUrl: submitted.companyLogoUrl ?? "",
    localLeaveDefaultDays: submitted.localLeaveDefaultDays ?? "",
    sickLeaveDefaultDays: submitted.sickLeaveDefaultDays ?? "",
    workingDays: submitted.workingDays ?? [],
    timezone: submitted.timezone ?? "",
    currency: (submitted.currency ?? "").toUpperCase(),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: submitted,
    };
  }

  const previous = await getAppSettingsAsAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .update({
      company_name: parsed.data.companyName,
      company_address: parsed.data.companyAddress,
      company_logo_url: parsed.data.companyLogoUrl,
      local_leave_default_days: parsed.data.localLeaveDefaultDays,
      sick_leave_default_days: parsed.data.sickLeaveDefaultDays,
      working_days: parsed.data.workingDays,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      updated_by: user.id,
    })
    .eq("singleton", true);

  if (error) {
    console.error("app-settings.update failed", error);
    return {
      success: false,
      message: "Could not save settings. Please try again.",
      values: submitted,
    };
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (previous) {
    const before: Record<string, unknown> = {
      companyName: previous.companyName,
      companyAddress: previous.companyAddress,
      companyLogoUrl: previous.companyLogoUrl,
      localLeaveDefaultDays: previous.localLeaveDefaultDays,
      sickLeaveDefaultDays: previous.sickLeaveDefaultDays,
      workingDays: previous.workingDays.join(","),
      timezone: previous.timezone,
      currency: previous.currency,
    };
    const after: Record<string, unknown> = {
      companyName: parsed.data.companyName,
      companyAddress: parsed.data.companyAddress,
      companyLogoUrl: parsed.data.companyLogoUrl,
      localLeaveDefaultDays: parsed.data.localLeaveDefaultDays,
      sickLeaveDefaultDays: parsed.data.sickLeaveDefaultDays,
      workingDays: parsed.data.workingDays.join(","),
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
    };
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) {
        diff[key] = { from: before[key], to: after[key] };
      }
    }
  }

  await insertAuditLog({
    actorId: user.id,
    action: "app_settings.updated",
    entity: "app_settings",
    entityId: null,
    metadata: { diff },
  });

  revalidatePath("/settings");

  return {
    success: true,
    message: "Settings saved.",
    values: submitted,
  };
}
