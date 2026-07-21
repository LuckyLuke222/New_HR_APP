"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateAppSettings,
  type AppSettingsActionState,
} from "@/server/actions/app-settings";
import type { AppSettings } from "@/server/dal/app-settings";

const initialAppSettingsState: AppSettingsActionState = {
  success: false,
  message: "",
};

const WORKING_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

const TIMEZONES = [
  "Indian/Mauritius",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Africa/Johannesburg",
  "Asia/Kolkata",
  "Asia/Singapore",
];

const CURRENCIES = ["MUR", "USD", "EUR", "GBP", "ZAR", "INR", "SGD"];

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, action, pending] = useActionState(
    updateAppSettings,
    initialAppSettingsState,
  );
  const v = state.values;

  const workingDaysDefault = v?.workingDays ?? settings.workingDays;

  return (
    <form action={action} className="space-y-6">
      {state.message && (
        <Alert
          role={state.success ? "status" : "alert"}
          variant={state.success ? "success" : "destructive"}
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Section
        title="Company"
        description="Used on documents and the employee portal."
      >
        <Field
          id="company-name"
          name="companyName"
          label="Company name"
          defaultValue={v?.companyName ?? settings.companyName}
          maxLength={200}
          error={state.fieldErrors?.companyName?.[0]}
        />
        <Field
          id="company-logo"
          name="companyLogoUrl"
          label="Logo URL"
          defaultValue={v?.companyLogoUrl ?? settings.companyLogoUrl}
          maxLength={500}
          placeholder="https://..."
          error={state.fieldErrors?.companyLogoUrl?.[0]}
        />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="company-address">Address</Label>
          <Textarea
            id="company-address"
            name="companyAddress"
            rows={3}
            maxLength={500}
            defaultValue={v?.companyAddress ?? settings.companyAddress}
          />
          {state.fieldErrors?.companyAddress && (
            <p className="text-xs text-destructive">{state.fieldErrors.companyAddress[0]}</p>
          )}
        </div>
      </Section>

      <Section
        title="Leave policy defaults"
        description="Used when seeding leave balances for new employees and (later) by the year-rollover action."
      >
        <Field
          id="local-leave-default"
          name="localLeaveDefaultDays"
          label="Local Leave days"
          type="number"
          min={0}
          max={365}
          defaultValue={v?.localLeaveDefaultDays ?? String(settings.localLeaveDefaultDays)}
          error={state.fieldErrors?.localLeaveDefaultDays?.[0]}
        />
        <Field
          id="sick-leave-default"
          name="sickLeaveDefaultDays"
          label="Sick Leave days"
          type="number"
          min={0}
          max={365}
          defaultValue={v?.sickLeaveDefaultDays ?? String(settings.sickLeaveDefaultDays)}
          error={state.fieldErrors?.sickLeaveDefaultDays?.[0]}
        />
      </Section>

      <Section
        title="Working week, timezone, currency"
        description="Timezone controls performance submission-deadline cutoffs; other values support future scheduling and payroll features."
      >
        <div className="space-y-2 sm:col-span-2">
          <span className="block text-xs font-medium uppercase text-muted-foreground">
            Working days
          </span>
          <div className="flex flex-wrap gap-3">
            {WORKING_DAYS.map((day) => (
              <label
                key={day.value}
                className="inline-flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="workingDays"
                  value={day.value}
                  defaultChecked={workingDaysDefault.includes(day.value)}
                  className="size-4 rounded border-input text-primary focus:ring-ring"
                />
                {day.label}
              </label>
            ))}
          </div>
          {state.fieldErrors?.workingDays && (
            <p className="text-xs text-destructive">{state.fieldErrors.workingDays[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-timezone">Timezone</Label>
          {/* Native datalist input kept — combobox-with-suggestions UX. */}
          <Input
            id="settings-timezone"
            name="timezone"
            list="settings-timezones"
            defaultValue={v?.timezone ?? settings.timezone}
            maxLength={64}
          />
          <datalist id="settings-timezones">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          {state.fieldErrors?.timezone && (
            <p className="text-xs text-destructive">{state.fieldErrors.timezone[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-currency">Currency</Label>
          <select
            id="settings-currency"
            name="currency"
            defaultValue={v?.currency ?? settings.currency}
            className={SELECT_CLASS}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          {state.fieldErrors?.currency && (
            <p className="text-xs text-destructive">{state.fieldErrors.currency[0]}</p>
          )}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
        {state.message && (
          <span
            role={state.success ? "status" : "alert"}
            aria-live="polite"
            className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow">
      <header className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
