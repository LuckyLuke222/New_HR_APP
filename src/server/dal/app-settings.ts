import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeDalError } from "./errors";

export type AppSettings = {
  companyName: string;
  companyAddress: string;
  companyLogoUrl: string;
  localLeaveDefaultDays: number;
  sickLeaveDefaultDays: number;
  workingDays: string[];
  timezone: string;
  currency: string;
  updatedAt: string;
  updatedBy: string | null;
};

const COLUMNS =
  "company_name, company_address, company_logo_url, local_leave_default_days, sick_leave_default_days, working_days, timezone, currency, updated_at, updated_by";

function rowToSettings(row: Record<string, unknown>): AppSettings {
  return {
    companyName: (row.company_name as string) ?? "",
    companyAddress: (row.company_address as string) ?? "",
    companyLogoUrl: (row.company_logo_url as string) ?? "",
    localLeaveDefaultDays: Number(row.local_leave_default_days ?? 0),
    sickLeaveDefaultDays: Number(row.sick_leave_default_days ?? 0),
    workingDays: ((row.working_days as string[] | null) ?? []).map(String),
    timezone: (row.timezone as string) ?? "",
    currency: (row.currency as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

export async function getAppSettings(): Promise<{
  settings: AppSettings | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select(COLUMNS)
    .eq("singleton", true)
    .maybeSingle();

  if (error) {
    return {
      settings: null,
      error: safeDalError("app-settings.get", error, "Unable to load settings."),
    };
  }

  return { settings: data ? rowToSettings(data) : null, error: null };
}

export async function getAppSettingsAsAdmin(): Promise<AppSettings | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select(COLUMNS)
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("app-settings.getAsAdmin failed", error);
    return null;
  }

  return rowToSettings(data);
}

export async function getAppTimezoneAsAdmin(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("timezone")
    .eq("singleton", true)
    .maybeSingle();

  if (error) {
    console.error("app-settings.getTimezoneAsAdmin failed", error);
    return null;
  }

  return data ? ((data.timezone as string | null) ?? null) : null;
}
