"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  selfUpdateCompensation,
  upsertCompensation,
  type CompensationActionState,
} from "@/server/actions/compensation";
import { maskBankAccount } from "@/lib/format";
import { MAURITIUS_BANKS } from "@/lib/mauritius-banks";
import { cn } from "@/lib/utils";
import type { CompensationRow } from "@/server/dal/compensation";

const initial: CompensationActionState = { success: false, message: "" };

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  hourly: "Hourly",
};

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "hourly", label: "Hourly" },
];

// Native <select> retained throughout (Playwright + Phase 13 C6 hard
// constraint). Styled to match shadcn `Input` so the form reads
// consistently.
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type Mode = "admin" | "employee-self";

type Props = {
  employeeId: string;
  compensation: CompensationRow | null;
  mode?: Mode;
};

export function CompensationForm({ employeeId, compensation: c, mode = "admin" }: Props) {
  const isSelf = mode === "employee-self";
  const action = isSelf ? selfUpdateCompensation : upsertCompensation;
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values;
  const router = useRouter();
  // F2: after a successful self-save the read-only salary block must reflect
  // DB truth. The `key` on the salary <dl> (below) handles the React
  // reconciliation gap that lets a DOM-edited salary value survive a re-render
  // when the underlying text is unchanged. router.refresh() is the
  // belt-and-suspenders companion: it forces a fresh RSC fetch instead of
  // relying solely on the form-action's automatic revalidation path, so the
  // server-rendered HTML really does replace the tampered DOM.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);
  const bankNameDefault = v?.bankName !== undefined
    ? v.bankName
    : c?.bankName && (MAURITIUS_BANKS as readonly string[]).includes(c.bankName)
      ? c.bankName
      : "";

  return (
    <form action={formAction} className="space-y-5">
      {!isSelf && <input type="hidden" name="employeeId" value={employeeId} />}

      {state.message && (
        <Alert
          role={state.success ? "status" : "alert"}
          variant={state.success ? "success" : "destructive"}
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {/* Salary — admin-only inputs; employee sees read-only display */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">
          Salary
          {isSelf && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (managed by admin)
            </span>
          )}
        </legend>
        {isSelf ? (
          // F2: key on updatedAt forces React to unmount+remount the read-only
          // salary block whenever the row changes server-side. Without this,
          // an inspector-tampered <dd> text node survives reconciliation
          // because the vdom diff sees identical content. updatedAt advances
          // on every row UPDATE via the set_updated_at trigger (migration
          // 0011), so a successful self-save always produces a new key.
          <dl key={c?.updatedAt ?? "no-row"} className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</dt>
              <dd className="mt-1 text-base font-semibold text-foreground">
                {c?.salaryAmount != null
                  ? `${c.salaryCurrency} ${c.salaryAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pay frequency</dt>
              <dd className="mt-1 text-base font-semibold text-foreground">
                {c?.payFrequency ? FREQUENCY_LABELS[c.payFrequency] : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Effective date</dt>
              <dd className="mt-1 text-base font-semibold text-foreground">
                {c?.effectiveDate ?? "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="cf-salary">Amount</Label>
                <Input
                  id="cf-salary"
                  name="salaryAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={v?.salaryAmount ?? c?.salaryAmount ?? ""}
                  placeholder="0.00"
                />
                {state.fieldErrors?.salaryAmount && (
                  <p className="text-xs text-destructive">{state.fieldErrors.salaryAmount[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-currency">Currency</Label>
                <select
                  id="cf-currency"
                  name="salaryCurrency"
                  required
                  defaultValue={v?.salaryCurrency ?? c?.salaryCurrency ?? "MUR"}
                  className={SELECT_CLASS}
                >
                  <option value="MUR">MUR — Mauritian Rupee</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
                {state.fieldErrors?.salaryCurrency && (
                  <p className="text-xs text-destructive">{state.fieldErrors.salaryCurrency[0]}</p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cf-freq">Pay frequency</Label>
                <select
                  id="cf-freq"
                  name="payFrequency"
                  required
                  defaultValue={v?.payFrequency ?? c?.payFrequency ?? ""}
                  className={SELECT_CLASS}
                >
                  <option value="">— Select —</option>
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.payFrequency && (
                  <p className="text-xs text-destructive">{state.fieldErrors.payFrequency[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-effective">Effective date</Label>
                <Input
                  id="cf-effective"
                  name="effectiveDate"
                  type="date"
                  required
                  defaultValue={v?.effectiveDate ?? c?.effectiveDate ?? ""}
                />
                {state.fieldErrors?.effectiveDate && (
                  <p className="text-xs text-destructive">{state.fieldErrors.effectiveDate[0]}</p>
                )}
              </div>
            </div>
          </>
        )}
      </fieldset>

      {/* Bank details */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Bank details</legend>
        <div className="space-y-1.5">
          <Label htmlFor="cf-bankname">Bank name</Label>
          <select
            id="cf-bankname"
            name="bankName"
            defaultValue={bankNameDefault}
            className={SELECT_CLASS}
          >
            <option value="">Select a bank…</option>
            {MAURITIUS_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
          {state.fieldErrors?.bankName && (
            <p className="text-xs text-destructive">{state.fieldErrors.bankName[0]}</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-holder">Account holder</Label>
            <Input
              id="cf-holder"
              name="bankAccountHolder"
              type="text"
              required
              maxLength={120}
              defaultValue={v?.bankAccountHolder ?? c?.bankAccountHolder ?? ""}
            />
            {state.fieldErrors?.bankAccountHolder && (
              <p className="text-xs text-destructive">{state.fieldErrors.bankAccountHolder[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Label htmlFor="cf-accountno">Account number</Label>
              {/* Reveal hint rendered OUTSIDE the <label> element. A nested
                  <button> inside <label> double-activates: the button's
                  onClick fires AND the label's HTML-spec activation focuses
                  the input. Keeping it as a sibling avoids the focus
                  jump while still associating visually with the field. */}
              {c?.bankAccountNumber && (
                <AccountNumberRevealHint value={c.bankAccountNumber} />
              )}
            </div>
            {/* F1: type="text" so the user can verify what they're typing.
                Intentionally not round-tripped on validation failure
                (Session 65). */}
            <Input
              id="cf-accountno"
              name="bankAccountNumber"
              type="text"
              autoComplete="off"
              placeholder={c?.bankAccountNumber ? "Enter new value to update; leave blank to keep current" : ""}
            />
          </div>
        </div>
      </fieldset>

      {/* Tax / ID */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Tax and identification</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-taxid">Tax ID</Label>
            <Input
              id="cf-taxid"
              name="taxId"
              type="text"
              autoComplete="off"
              required
              maxLength={64}
              defaultValue={v?.taxId ?? c?.taxId ?? ""}
            />
            {state.fieldErrors?.taxId && (
              <p className="text-xs text-destructive">{state.fieldErrors.taxId[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-nationalid">National ID</Label>
            <Input
              id="cf-nationalid"
              name="nationalId"
              type="text"
              autoComplete="off"
              required
              maxLength={64}
              defaultValue={v?.nationalId ?? c?.nationalId ?? ""}
            />
            {state.fieldErrors?.nationalId && (
              <p className="text-xs text-destructive">{state.fieldErrors.nationalId[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-passport">Passport number</Label>
            <Input
              id="cf-passport"
              name="passportNumber"
              type="text"
              autoComplete="off"
              maxLength={64}
              defaultValue={v?.passportNumber ?? c?.passportNumber ?? ""}
            />
            {state.fieldErrors?.passportNumber && (
              <p className="text-xs text-destructive">{state.fieldErrors.passportNumber[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-nationality">Nationality</Label>
            <Input
              id="cf-nationality"
              name="nationality"
              type="text"
              maxLength={80}
              defaultValue={v?.nationality ?? c?.nationality ?? ""}
              placeholder="e.g. Mauritian"
            />
            {state.fieldErrors?.nationality && (
              <p className="text-xs text-destructive">{state.fieldErrors.nationality[0]}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Notes — admin-only, hidden entirely from employee self-edit */}
      {!isSelf && (
        <div className="space-y-1.5">
          <Label htmlFor="cf-notes">Notes</Label>
          <Textarea
            id="cf-notes"
            name="notes"
            rows={3}
            defaultValue={v?.notes ?? c?.notes ?? ""}
          />
        </div>
      )}

      {/* C2: inline save feedback near the button so users don't have to scroll up. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isSelf ? "Save my details" : "Save compensation"}
        </Button>
        {state.message && (
          <p
            role="status"
            className={cn(
              "text-sm",
              state.success ? "text-emerald-700" : "text-destructive",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

// F1: small inline toggle next to the Account number label. Renders the
// masked stored value by default with a Show/Hide button. Pure client-side
// reveal — the full value is already in the page payload (it flows through
// CompensationRow → form props), so this changes presentation only, not the
// security boundary.
function AccountNumberRevealHint({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground/70">
      (current: {revealed ? value : maskBankAccount(value)})
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="font-sans text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        aria-pressed={revealed}
        aria-label={revealed ? "Hide stored account number" : "Show stored account number"}
      >
        {revealed ? "Hide" : "Show"}
      </button>
    </span>
  );
}
