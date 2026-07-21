// Executable mirror of docs/access-matrix.md §6 — the application-layer
// authorization spot-checks (Step 2 of the access-matrix initiative).
//
// This suite encodes ONLY the §6 cells that are NOT already proven by the
// existing specs, so it never duplicates passing coverage. The cells already
// covered (and where) are recorded in docs/access-matrix.md §6; the cross-refs
// below name the matrix row each test proves.
//
// Coverage delta vs. the rest of tests/e2e:
//   §6.1 peer/stranger reads
//     - /employees/[id] peer projection ............ employee.spec.ts (B7)        [covered]
//     - documents SELECT (employee→other, RLS) ..... rls.spec.ts                  [covered]
//     - getSignedDownloadUrl forge (action layer) .. AM2 here                     [GAP]
//     - uploadDocument employee→other (forge) ...... AM6 here                     [GAP, was test.skip]
//   §6.2 manager scope
//     - assignTemplate / savePerformanceGoal ....... security-rbac / manager.spec [covered]
//     - uploadDocument manager→non-report .......... AM3 here                     [GAP]
//   §6.3 manager cannot read report base comp ...... rls.spec.ts                  [covered]
//   §6.6 write-side ownership
//     - updateOwnGoalProgress not-owner ............ employee.spec.ts             [covered]
//     - submitSelfReview not-owner ................. AM8 here                     [GAP]
//     - acknowledgeReview not-owner ................ AM9 here                     [GAP]
//
// Forge methodology — two techniques, chosen by surface:
//   - Network capture/replay (tests/e2e/forge.ts): capture a legitimate Server
//     Action POST, swap one UUID in the body, replay from the same auth context.
//     Used for getSignedDownloadUrl (AM2), whose body is plain (no File entry).
//   - DOM hidden-input / <select> swap + native submit: used for uploadDocument
//     (AM3/AM6) and the review actions (AM8/AM9). Upload POSTs carry a File
//     entry, for which Playwright returns a null body (#6479), so capture/replay
//     is unavailable — the crafted-form swap (proven by manager.spec.ts /
//     employee.spec.ts) reaches the server guard instead. Swap the field LAST:
//     earlier interactions trigger React re-renders that re-apply controlled
//     values.

import { expect, test } from "@playwright/test";

import {
  captureServerAction,
  expectDenyAudit,
  forgeAndReplay,
  nowIso,
} from "./forge";
import {
  createPerformanceCycle,
  createPerformanceReview,
  ids,
  supabaseAdmin,
  uniqueName,
} from "./helpers";

const AUTH = {
  admin: "playwright/.auth/admin.json",
  manager: "playwright/.auth/manager.json",
  alice: "playwright/.auth/employee.json",
} as const;

// ─── §6.1 — peer/stranger reads (Alice, employee) ────────────────────────────

test.describe("access-matrix §6.1 — peer/stranger reads (Alice)", () => {
  test.use({ storageState: AUTH.alice });

  // AM2 — matrix §3 getSignedDownloadUrl / §4 Storage. Alice forges the
  // documentId of Bob's document into a legitimate own-document download. The
  // action fetches the row with the SESSION client (RLS), gets nothing, and
  // returns "not found or access denied" WITHOUT minting a signed URL — proving
  // the admin client never signs a path the caller cannot already see. RLS-deny
  // here is audited as entity.not_found (reason missing_or_rls_denied), not
  // auth.access_denied (see docs/access-matrix.md §6.7).
  test("AM2 — alice forging getSignedDownloadUrl with bob's documentId is denied (no URL minted)", async ({
    page,
  }) => {
    const aliceTitle = uniqueName("AM2 download donor alice");
    const bobTitle = uniqueName("AM2 download victim bob");
    const { data: aliceDoc, error: aliceErr } = await supabaseAdmin
      .from("documents")
      .insert({
        employee_id: ids.alice,
        uploaded_by: ids.admin,
        category: "policy",
        title: aliceTitle,
        storage_path: `${ids.alice}/policy/${crypto.randomUUID()}.txt`,
        file_size: 5,
        mime_type: "text/plain",
        is_shared: false,
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(aliceErr).toBeNull();
    const { data: bobDoc, error: bobErr } = await supabaseAdmin
      .from("documents")
      .insert({
        employee_id: ids.bob,
        uploaded_by: ids.admin,
        category: "policy",
        title: bobTitle,
        storage_path: `${ids.bob}/policy/${crypto.randomUUID()}.txt`,
        file_size: 5,
        mime_type: "text/plain",
        is_shared: false,
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(bobErr).toBeNull();

    try {
      await page.goto("/documents");
      const row = page.getByRole("row").filter({ hasText: aliceTitle });
      await expect(row).toBeVisible();

      const since = nowIso();
      // captureServerAction intercepts the POST at SEND time, before the server
      // processes it — so the donor's server-side outcome is irrelevant (no real
      // blob is stored, and we never open the popup). The asserted path is the
      // forged replay below: Alice → Bob's docId is denied at the RLS row read,
      // which precedes any storage call, so a missing blob can't short-circuit it.
      const captured = await captureServerAction(page, async () => {
        await row.getByRole("button", { name: "Download" }).click();
      });

      const { status, body } = await forgeAndReplay(
        page,
        captured,
        aliceDoc!.id,
        bobDoc!.id,
      );
      expect(status).toBe(200);
      expect(body).toMatch(/not found or access denied/i);

      // entity.not_found row for the forged (Bob's) documentId — scoped to
      // Alice as actor + reason missing_or_rls_denied so a stray row for the
      // same doc id can't satisfy it (the action's RLS-denied branch).
      const { data: am2Audit } = await supabaseAdmin
        .from("audit_logs")
        .select("metadata")
        .eq("action", "entity.not_found")
        .eq("actor", ids.alice)
        .eq("entity_id", bobDoc!.id)
        .gte("created_at", since);
      expect(
        (am2Audit ?? []).some(
          (r) => (r.metadata as { reason?: string } | null)?.reason === "missing_or_rls_denied",
        ),
        "expected an entity.not_found row for alice on bob's doc with reason missing_or_rls_denied",
      ).toBeTruthy();
    } finally {
      await supabaseAdmin
        .from("documents")
        .delete()
        .in("id", [aliceDoc!.id, bobDoc!.id]);
    }
  });

  // AM6 — matrix §3 uploadDocument (employee own only). Alice fills a legitimate
  // self-upload, then the hidden employeeId is swapped to Bob's via the DOM and
  // the form is submitted natively (no capture). The action's
  // `employee_id === user.id` guard rejects it. Replaces the previously-skipped
  // "step 13": a network capture/replay forge can't be used here — Playwright
  // returns a null body for multipart POSTs carrying a File entry (#6479) — so
  // we use the DOM hidden-input swap proven by manager.spec.ts / employee.spec.ts.
  test("AM6 — alice forging uploadDocument with bob's employeeId is denied", async ({ page }) => {
    const title = uniqueName("AM6 upload forge alice");
    try {
      await page.goto("/documents");
      await page.locator("#document-upload-panel summary").click();
      await page.locator("#up-category").selectOption("policy");
      await page.locator("#up-title").fill(title);
      // Category "policy" requires a PDF (client-side file validation rejects
      // other types before submit), so attach a minimal valid PDF.
      await page.locator("#up-file").setInputFiles({
        name: "am6.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nAM6 forge\n"),
      });

      // Swap the hidden employeeId LAST — earlier field interactions trigger
      // React re-renders that re-apply the controlled value={currentUserId}.
      await page
        .locator("input[type='hidden'][name='employeeId']")
        .evaluate((el, value) => {
          (el as HTMLInputElement).value = value;
        }, ids.bob);

      const since = nowIso();
      await page.getByRole("button", { name: "Upload document" }).click();
      await expect(
        page.getByText("You can only upload documents for yourself.").first(),
      ).toBeVisible();

      // No document landed on Bob.
      const { data: bobDocs } = await supabaseAdmin
        .from("documents")
        .select("id")
        .eq("employee_id", ids.bob)
        .eq("title", title);
      expect(bobDocs ?? []).toEqual([]);

      // The employee deny logs metadata.target_employee_id (no entity_id), so
      // scope the assertion to alice acting on bob — not just any alice deny.
      const { data: am6Audit } = await supabaseAdmin
        .from("audit_logs")
        .select("metadata")
        .eq("action", "auth.access_denied")
        .eq("actor", ids.alice)
        .gte("created_at", since);
      expect(
        (am6Audit ?? []).some(
          (r) =>
            (r.metadata as { target_employee_id?: string } | null)?.target_employee_id === ids.bob,
        ),
        "expected an auth.access_denied row for alice targeting bob's employeeId",
      ).toBeTruthy();
    } finally {
      // Defensive: the submit is denied (nothing lands), but reap by title anyway.
      await supabaseAdmin.from("documents").delete().eq("title", title);
    }
  });
});

// ─── §6.2 — manager scope (Morgan, manager) ──────────────────────────────────

test.describe("access-matrix §6.2 — manager scope (Morgan)", () => {
  test.use({ storageState: AUTH.manager });

  // AM3 — matrix §3 uploadDocument (manager → direct reports only). Morgan fills
  // a legitimate Policy upload, then the employeeId <select> is forced to Bob
  // (manager_id = null → out of scope) by injecting an out-of-list option, and
  // the form is submitted natively. The action rejects with reason
  // manager_upload_outside_scope. Automates the Session-178 MS5 forge; closes the
  // "missing manager-upload Playwright pin" follow-up. DOM swap (not a network
  // capture/replay) because Playwright returns a null body for File multipart
  // POSTs (#6479).
  test("AM3 — morgan forging uploadDocument for non-report bob is denied (outside scope)", async ({
    page,
  }) => {
    // Defensive precondition: Bob must be out of Morgan's scope. A prior test or
    // manual session could have set Bob.manager_id = Morgan, which would make the
    // scope check pass and silently land a doc on Bob. Mirrors security-rbac /
    // rls preconditions.
    await supabaseAdmin
      .from("employee_records")
      .update({ manager_id: null, updated_by: ids.admin })
      .eq("employee_id", ids.bob);

    const title = uniqueName("AM3 manager upload forge bob");
    try {
      await page.goto("/documents");
      await page.locator("#document-upload-panel summary").click();
      await page.locator("#up-category").selectOption("policy");
      await page.locator("#up-title").fill(title);
      // Category "policy" requires a PDF (client-side file validation), so
      // attach a minimal valid PDF.
      await page.locator("#up-file").setInputFiles({
        name: "am3.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nAM3 forge\n"),
      });

      // Force the employeeId <select> to Bob — not one of Morgan's options, so
      // inject the option then select it. Done LAST to avoid a React re-render
      // resetting it. SearchableSelectField renders an sr-only real <select>.
      await page
        .locator('select[name="employeeId"]')
        .first()
        .evaluate((el, bobId) => {
          const sel = el as HTMLSelectElement;
          if (!Array.from(sel.options).some((o) => o.value === bobId)) {
            const opt = document.createElement("option");
            opt.value = bobId;
            opt.textContent = "forged";
            sel.appendChild(opt);
          }
          sel.value = bobId;
        }, ids.bob);

      const since = nowIso();
      await page.getByRole("button", { name: "Upload document" }).click();
      await expect(
        page
          .getByText(
            "Managers can upload their own documents, or Policy/Other documents for a direct report.",
          )
          .first(),
      ).toBeVisible();

      // No document landed on Bob.
      const { data: bobDocs } = await supabaseAdmin
        .from("documents")
        .select("id")
        .eq("employee_id", ids.bob)
        .eq("title", title);
      expect(bobDocs ?? []).toEqual([]);

      await expectDenyAudit({
        actorId: ids.manager,
        reason: "manager_upload_outside_scope",
        since,
      });
    } finally {
      // Defensive: the submit is denied (nothing lands), but reap by title anyway.
      await supabaseAdmin.from("documents").delete().eq("title", title);
    }
  });
});

// ─── §6.6 — write-side ownership: reviews (Alice, employee) ───────────────────

test.describe("access-matrix §6.6 — write-side review ownership (Alice)", () => {
  test.use({ storageState: AUTH.alice });

  // AM8 — matrix §3 submitSelfReview (own only). Alice's own draft review form
  // has its hidden reviewId swapped to Bob's review. submitSelfReview reads the
  // row via the ADMIN client then checks employee_id === user.id, so the forge
  // reaches the ownership guard (no RLS short-circuit): reason self_review_not_owner.
  test("AM8 — alice forging submitSelfReview with bob's reviewId is denied", async ({ page }) => {
    const cycleTitle = uniqueName("AM8 Self Review Cycle");
    const cycleId = await createPerformanceCycle(cycleTitle);
    const aliceReviewId = await createPerformanceReview({
      employeeId: ids.alice,
      cycleId,
      status: "draft",
    });
    const bobReviewId = await createPerformanceReview({
      employeeId: ids.bob,
      cycleId,
      status: "draft",
    });

    try {
      await page.goto("/performance?view=reviews");
      const selfArticle = page.locator("article").filter({ hasText: cycleTitle });
      await selfArticle.getByLabel("Self-review comment").fill("Forged self-review attempt.");
      await selfArticle.locator("input[name='reviewId']").evaluate((el, value) => {
        (el as HTMLInputElement).value = value;
      }, bobReviewId);

      const since = nowIso();
      await selfArticle.getByRole("button", { name: "Save self-review" }).click();
      await expect(page.getByText("You can only update your own review.")).toBeVisible();

      // Bob's review must be untouched (still draft, no self_review text).
      const { data: bobAfter } = await supabaseAdmin
        .from("performance_reviews")
        .select("status, self_review")
        .eq("id", bobReviewId)
        .single();
      expect(bobAfter?.status).toBe("draft");
      expect(bobAfter?.self_review).toBeNull();

      await expectDenyAudit({ actorId: ids.alice, reason: "self_review_not_owner", since });
    } finally {
      await supabaseAdmin
        .from("performance_reviews")
        .delete()
        .in("id", [aliceReviewId, bobReviewId]);
      await supabaseAdmin.from("performance_review_cycles").delete().eq("id", cycleId);
    }
  });

  // AM9 — matrix §3 acknowledgeReview (own only). Alice's own manager-submitted
  // review (Acknowledge button rendered) has its hidden reviewId swapped to Bob's
  // manager-submitted review. acknowledgeReview reads via the ADMIN client then
  // checks ownership: reason acknowledge_not_owner.
  test("AM9 — alice forging acknowledgeReview with bob's reviewId is denied", async ({ page }) => {
    const cycleTitle = uniqueName("AM9 Ack Review Cycle");
    const cycleId = await createPerformanceCycle(cycleTitle);
    const aliceReviewId = await createPerformanceReview({
      employeeId: ids.alice,
      cycleId,
      status: "manager_submitted",
      score: 4,
    });
    const bobReviewId = await createPerformanceReview({
      employeeId: ids.bob,
      cycleId,
      status: "manager_submitted",
      score: 3,
    });

    try {
      await page.goto("/performance?view=reviews");
      const ackArticle = page.locator("article").filter({ hasText: cycleTitle });
      await expect(ackArticle.getByRole("button", { name: "Acknowledge review" })).toBeVisible();
      await ackArticle.locator("input[name='reviewId']").evaluate((el, value) => {
        (el as HTMLInputElement).value = value;
      }, bobReviewId);

      const since = nowIso();
      await ackArticle.getByRole("button", { name: "Acknowledge review" }).click();
      // The deny message renders in both a form-level banner and an inline
      // status (two role=alert nodes) — assert the first.
      await expect(
        page.getByText("You can only acknowledge your own review.").first(),
      ).toBeVisible();

      // Bob's review must remain manager_submitted (not acknowledged).
      const { data: bobAfter } = await supabaseAdmin
        .from("performance_reviews")
        .select("status")
        .eq("id", bobReviewId)
        .single();
      expect(bobAfter?.status).toBe("manager_submitted");

      await expectDenyAudit({ actorId: ids.alice, reason: "acknowledge_not_owner", since });
    } finally {
      await supabaseAdmin
        .from("performance_reviews")
        .delete()
        .in("id", [aliceReviewId, bobReviewId]);
      await supabaseAdmin.from("performance_review_cycles").delete().eq("id", cycleId);
    }
  });
});
