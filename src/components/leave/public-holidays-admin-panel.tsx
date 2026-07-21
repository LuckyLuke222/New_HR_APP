"use client";

import { useActionState, useMemo, useState } from "react";
import {
  bulkUploadPublicHolidays,
  createPublicHoliday,
  togglePublicHoliday,
  updatePublicHoliday,
  type PublicHolidayActionState,
} from "@/server/actions/leave";
import type { PublicHoliday } from "@/server/dal/leave";

const initial: PublicHolidayActionState = { success: false, message: "" };

type ParsedRow = {
  lineNumber: number;
  raw: string;
  date?: string;
  name?: string;
  countryCode?: string;
  isTentative?: boolean;
  isDuplicate?: boolean;
  error?: string;
};

export function PublicHolidaysAdminPanel({
  holidays,
}: {
  holidays: PublicHoliday[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createPublicHoliday,
    initial,
  );

  const grouped = useMemo(() => {
    const map = new Map<number, PublicHoliday[]>();
    for (const h of holidays) {
      const year = Number(h.date.slice(0, 4));
      const list = map.get(year) ?? [];
      list.push(h);
      map.set(year, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [holidays]);

  const tentativeCount = holidays.filter((h) => h.isActive && h.isTentative).length;

  // F6 — controlled open state so the panel does not collapse when a Server
  // Action revalidates the route. Uncontrolled <details> loses its open
  // property on revalidation re-render, which would silently swallow the
  // success message after Add / Save / bulk upload.
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-md border bg-card text-card-foreground shadow"
    >
      <summary className="cursor-pointer border-b px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="inline text-sm font-semibold text-foreground">
          Public holidays
          <span
            aria-hidden="true"
            className="ml-2 text-xs text-muted-foreground transition-transform group-open:rotate-90 inline-block"
          >
            ▸
          </span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Dates excluded from working-day leave counting. Mauritius is seeded by
          default; edit or bulk-upload to keep the list current.
        </p>
        {tentativeCount > 0 && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            <strong>{tentativeCount}</strong> tentative holiday
            {tentativeCount === 1 ? " is" : "s are"} awaiting gazette confirmation
            (e.g. Eid moon-sighting). Edit each row to mark confirmed once the
            date is gazetted.
          </p>
        )}
      </summary>

      {/* Add form */}
      <div id="public-holiday-form" className="border-b px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add public holiday
        </h3>
        <form action={createAction} className="grid gap-3 sm:grid-cols-[160px_1fr_auto_auto]">
          <input type="hidden" name="countryCode" value="MU" />
          <div>
            <label htmlFor="ph-date" className="sr-only">
              Date
            </label>
            <input
              id="ph-date"
              type="date"
              name="date"
              required
              defaultValue={createState.values?.date ?? ""}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            />
            {createState.fieldErrors?.date && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {createState.fieldErrors.date[0]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="ph-name" className="sr-only">
              Name
            </label>
            <input
              id="ph-name"
              name="name"
              required
              defaultValue={createState.values?.name ?? ""}
              placeholder="e.g. Labour Day"
              maxLength={120}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            />
            {createState.fieldErrors?.name && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {createState.fieldErrors.name[0]}
              </p>
            )}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-xs text-muted-foreground has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50 has-[:checked]:text-amber-900">
            <input
              type="checkbox"
              name="isTentative"
              defaultChecked={createState.values?.isTentative === "on"}
              className="h-3.5 w-3.5"
            />
            Tentative
          </label>
          <button
            type="submit"
            disabled={createPending}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {createPending ? "…" : "Add"}
          </button>
        </form>
        {createState.message && (
          <p
            role="alert"
            className={`mt-2 text-xs ${createState.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {createState.message}
          </p>
        )}
      </div>

      {/* CSV bulk upload */}
      <BulkUploadSection existingHolidays={holidays} />

      {/* Year-grouped list */}
      {grouped.length > 0 ? (
        <div className="divide-y divide-border">
          {grouped.map(([year, list]) => (
            <details key={year} className="px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                {year}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {list.length}
                </span>
              </summary>
              <ul className="mt-2 divide-y divide-border">
                {list.map((h) => (
                  <PublicHolidayRow key={h.id} holiday={h} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No public holidays configured yet. Add one above or bulk-upload a CSV.
        </p>
      )}
    </details>
  );
}

function PublicHolidayRow({ holiday }: { holiday: PublicHoliday }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(
    updatePublicHoliday,
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    togglePublicHoliday,
    initial,
  );

  // F5 — collapse the row out of edit mode once the server action returns
  // success. Uses React's "storing information from previous renders" pattern
  // (setState during render is sanctioned; useEffect+setState here would trip
  // react-hooks/set-state-in-effect, and a ref mutation in render would trip
  // react-hooks/refs). useActionState returns a fresh object per dispatch,
  // so updateState !== prevUpdateState fires exactly once per save.
  const [prevUpdateState, setPrevUpdateState] = useState(updateState);
  if (prevUpdateState !== updateState) {
    setPrevUpdateState(updateState);
    if (updateState.success) setEditing(false);
  }

  if (editing) {
    return (
      <li className="px-2 py-3">
        <form action={updateAction} className="grid gap-2 sm:grid-cols-[140px_1fr_auto_auto_auto]">
          <span className="self-center text-sm text-muted-foreground">{holiday.date}</span>
          <input type="hidden" name="id" value={holiday.id} />
          <input
            name="name"
            defaultValue={holiday.name}
            required
            maxLength={120}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
          />
          <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs text-muted-foreground has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50 has-[:checked]:text-amber-900">
            <input
              type="checkbox"
              name="isTentative"
              defaultChecked={holiday.isTentative}
              className="h-3.5 w-3.5"
            />
            Tentative
          </label>
          <button
            type="submit"
            disabled={updatePending}
            className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {updatePending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-9 rounded-md border border-input px-3 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </form>
        {updateState.message && (
          <p
            role="alert"
            className={`mt-1 text-xs ${updateState.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {updateState.message}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-2 py-3">
      <span className="w-[110px] shrink-0 text-sm font-mono text-muted-foreground">
        {holiday.date}
      </span>
      <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
        {holiday.name}
      </span>
      {holiday.isTentative && (
        <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
          Tentative
        </span>
      )}
      <span
        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
          holiday.isActive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border bg-muted text-muted-foreground"
        }`}
      >
        {holiday.isActive ? "Active" : "Inactive"}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md border border-input px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        Edit
      </button>
      <form action={toggleAction}>
        <input type="hidden" name="id" value={holiday.id} />
        <input type="hidden" name="isActive" value={String(holiday.isActive)} />
        <button
          type="submit"
          disabled={togglePending}
          className="rounded-md border border-input px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {togglePending ? "…" : holiday.isActive ? "Deactivate" : "Activate"}
        </button>
      </form>
      {toggleState.message && !toggleState.success && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {toggleState.message}
        </p>
      )}
      {/* F5 — success confirmation persists into the read view after the row
          auto-exits edit mode; otherwise the toast disappears on collapse. */}
      {updateState.success && updateState.message && (
        <p role="status" className="basis-full text-xs text-emerald-700">
          {updateState.message}
        </p>
      )}
    </li>
  );
}

// ─── CSV bulk upload ────────────────────────────────────────────────────────

const MAX_ROWS = 200;

function BulkUploadSection({
  existingHolidays,
}: {
  existingHolidays: PublicHoliday[];
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [commitState, commitAction, commitPending] = useActionState(
    bulkUploadPublicHolidays,
    initial,
  );

  // Build a Set of (date|country|name) for already-active holidays in the
  // current + next year window so the preview can flag DB duplicates before
  // commit (not just within-file dupes). Server-side check at commit is still
  // authoritative — this is preview UX, not enforcement.
  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const h of existingHolidays) {
      if (h.isActive) set.add(`${h.date}|${h.countryCode}|${h.name}`);
    }
    return set;
  }, [existingHolidays]);

  const validRows = rows.filter((r) => !r.error && !r.isDuplicate);
  const errorRows = rows.filter((r) => r.error);
  const duplicateRows = rows.filter((r) => r.isDuplicate);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]);
    setParseError("");
    setFileName("");
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

      // Skip a header line if it looks like one (case-insensitive "date,name").
      const startIdx = /^date\s*,/i.test(lines[0] ?? "") ? 1 : 0;
      const dataLines = lines.slice(startIdx);

      if (dataLines.length > MAX_ROWS) {
        setParseError(
          `Max ${MAX_ROWS} rows per upload — this file has ${dataLines.length}. Split into smaller files.`,
        );
        return;
      }

      const parsed: ParsedRow[] = dataLines.map((raw, i) => {
        const lineNumber = startIdx + i + 1;
        const cells = raw.split(",").map((c) => c.trim());
        const [date, name, countryCode, tentative] = cells;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { lineNumber, raw, error: "Date must be YYYY-MM-DD." };
        }
        if (!name || name.length < 2) {
          return { lineNumber, raw, date, error: "Name is required (min 2 characters)." };
        }
        const cc = (countryCode || "MU").toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) {
          return { lineNumber, raw, date, name, error: "Country code must be 2 letters." };
        }
        return {
          lineNumber,
          raw,
          date,
          name,
          countryCode: cc,
          isTentative: tentative === "true" || tentative === "1",
        };
      });

      // Detect duplicates: (a) within the file itself, (b) against existing
      // active holidays already in the DB. Both surface as "Duplicate" in the
      // preview so the row count to insert is honest before commit.
      const seen = new Set<string>();
      for (const row of parsed) {
        if (row.error) continue;
        const key = `${row.date}|${row.countryCode}|${row.name}`;
        if (seen.has(key) || existingKeys.has(key)) {
          row.isDuplicate = true;
        } else {
          seen.add(key);
        }
      }

      setRows(parsed);
    };
    reader.readAsText(file);
  }

  return (
    <div className="border-b px-4 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CSV bulk upload
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Columns: <code>date,name[,countryCode,tentative]</code>. Country defaults
        to MU; tentative defaults to false. Header row optional. Max {MAX_ROWS} rows.
        Duplicate (date, name, country) skipped on commit.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFileChange}
          className="block text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted"
        />
        {fileName && (
          <span className="text-xs text-muted-foreground">{fileName}</span>
        )}
      </div>

      {parseError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {parseError}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 max-h-64 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Line</th>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.lineNumber}
                    className={
                      row.error
                        ? "bg-destructive/5"
                        : row.isDuplicate
                          ? "bg-amber-50"
                          : ""
                    }
                  >
                    <td className="px-2 py-1 text-muted-foreground">{row.lineNumber}</td>
                    <td className="px-2 py-1 font-mono">{row.date ?? "—"}</td>
                    <td className="px-2 py-1">{row.name ?? "—"}</td>
                    <td className="px-2 py-1">
                      {row.error ? (
                        <span className="text-destructive">{row.error}</span>
                      ) : row.isDuplicate ? (
                        <span className="text-amber-700">Duplicate in file</span>
                      ) : (
                        <span className="text-emerald-700">Insert</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {validRows.length} to insert
            </span>
            {duplicateRows.length > 0 && (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                {duplicateRows.length} duplicate
              </span>
            )}
            {errorRows.length > 0 && (
              <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-destructive">
                {errorRows.length} invalid
              </span>
            )}
          </div>

          <form action={commitAction} className="mt-3">
            <input
              type="hidden"
              name="payload"
              value={JSON.stringify(
                validRows.map((r) => ({
                  date: r.date!,
                  name: r.name!,
                  countryCode: r.countryCode ?? "MU",
                  isTentative: Boolean(r.isTentative),
                })),
              )}
            />
            <button
              type="submit"
              disabled={
                commitPending || validRows.length === 0 || errorRows.length > 0
              }
              className="h-9 rounded-md bg-primary px-4 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {commitPending
                ? "Uploading…"
                : errorRows.length > 0
                  ? "Fix invalid rows to commit"
                  : `Commit ${validRows.length} row(s)`}
            </button>
            {commitState.message && (
              <p
                role="alert"
                className={`mt-2 text-xs ${commitState.success ? "text-emerald-700" : "text-destructive"}`}
              >
                {commitState.message}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
