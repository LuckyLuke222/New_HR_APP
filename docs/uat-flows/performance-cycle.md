# Performance Cycle

**Time:** 40 minutes  •  **Roles:** admin → manager → employee  •  **Modules:** `/performance`, `/performance/reviews`, `/audit-logs`

One full appraisal cycle: admin creates and activates a review cycle → manager assigns a goal → employee self-reviews → manager submits appraisal → employee acknowledges. Verifies the cycle-first manager workspace (Session 98 / Batch 12) and the cross-role feedback panels.

## Codex update (2026-05-26) - Presentation navigation

`/performance` is now grouped into role-aware tabs without changing the lifecycle: admin lands on **Cycles**, manager lands on **Appraisals**, and employee lands on **My goals**. Use the named tabs below to move between tasks. Admin closed cycles remain available under the collapsed **Past cycles** section.

## Preconditions

- All four seed users sign in.
- Alice is Morgan's direct report (default seed).
- Note the latest audit timestamp.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Admin | Open `/performance` on the default **Cycles** tab. Expand **Create review cycle**. Fill: title "UAT Cycle <date>", **status Draft**, start/end dates spanning a recent period, optional description. Submit. | New cycle row appears in **Current cycles** with status **Draft**. Next-steps panel renders navigation links. Audit row `performance.cycle_created`. |
| 2 | Admin | From **Current cycles**, click **Edit** on the new cycle. Set status to **Active**. Save. | Status changes to Active. Audit row `performance.cycle_activated`. |
| 3 | Manager | Sign in. Open `/performance`, select **Goals**, expand **Set or update goal**. Pick Alice, the UAT cycle, due date in the cycle window, title "UAT Goal — Q1 outcomes", progress 0, status Not started. Submit. | Goal appears under **Goals in scope** for Alice. Audit row `performance.goal_created`. |
| 4 | Manager | Try assigning a second goal but switch Employee to Bob (not a direct report). Submit. | Action rejected with "You can only manage goals for employees in your scope." No goal created. Audit row `auth.access_denied` for the attempted action. |
| 5 | Alice | Sign in. Open `/performance`, verify **My goals**, then select **Reviews**. | Sees the UAT goal while on **My goals**; after switching, sees the UAT cycle in **REviews** (pending self-review). |
| 6 | Alice | Edit own goal progress to 60%, add a progress note "UAT — halfway done", save. | Goal progress = 60%, status auto-suggests "In progress". Audit row `performance.goal_progress_updated`. |
| 7 | Alice | On **Reviews**, submit a self-review for the UAT cycle with text "UAT — exceeded scope". | Self-review submitted, status now `self_reviewed`. Audit row `performance.self_review_submitted`. |
| 8 | Manager | Open `/performance` on the default **Appraisals** tab. | Sees the UAT cycle row with Alice's self-review available. Action item count for Morgan reflects 1 pending appraisal. |
| 9 | Manager | Open the **Appraisal workspace**: select the UAT cycle and Alice. | Workspace shows Alice's self-review text + her UAT goal + progress on the left. Score / strengths / improvements / next steps on the right (Session 98 / Batch 12 layout). |
| 10 | Manager | Save a draft (e.g. score 4, strengths "UAT draft strengths", improvements "UAT draft improvements"). Do not submit yet. | Draft saved. Alice **cannot** see manager score/feedback yet (it's a draft). Audit row `performance.manager_draft_saved` or similar. |
| 11 | Alice | Refresh `/performance?view=reviews` or select **Reviews**. | UAT cycle still appears as pending manager appraisal — no manager score visible. |
| 12 | Manager | Return to the workspace and **submit** the appraisal (score 4, all fields filled, next steps "UAT — lead a planning review"). | Review status `manager_submitted`. Audit row `performance.manager_review_submitted`. |
| 13 | Alice | Refresh `/dashboard`. | UAT cycle appears in **Recent updates** ("manager appraisal submitted"). Action items shows "Acknowledge appraisal". |
| 14 | Alice | Click the action item. Read the manager appraisal. Acknowledge. | Review status `acknowledged`. Audit row `performance.review_acknowledged`. |
| 15 | Manager | Try to re-edit the acknowledged review (submit a second time with different score). | Update is rejected: "Acknowledged reviews cannot be edited." (Session 88 / earlier regression.) |
| 16 | Admin | Open `/audit-logs` and filter by entity `performance_reviews`. | Full audit trail visible for the UAT cycle. |
| 17 | Admin | On **Cycles**, edit the UAT cycle back to **Closed**, then expand **Past cycles**. | Status changes and the closed cycle appears under **Past cycles**. Audit row `performance.cycle_closed`. Closed cycles remain in history but no new goals can be added against them. |

## Audit log events to verify

- `performance.cycle_created` × 1
- `performance.cycle_activated` × 1
- `performance.cycle_closed` × 1
- `performance.goal_created` × 1
- `performance.goal_progress_updated` × 1
- `performance.self_review_submitted` × 1
- `performance.manager_review_submitted` × 1
- `performance.review_acknowledged` × 1
- `auth.access_denied` × 1 (Morgan trying to assign Bob)

## Codex update (2026-05-26) — Deadline-lock follow-up

Run this focused follow-up with an active cycle whose submission deadline is yesterday and **Hard-lock after deadline** enabled:

| Actor | Step | Pass criteria |
|---|---|---|
| Admin | On **Cycles**, edit the locked cycle and inspect the deadline controls. Uncheck hard-lock, choose **Keep hard-lock**, then uncheck again and choose **Unlock and save**. | **Codex update (2026-05-26):** Guidance explains that acknowledgment remains open; an inline warning panel appears before disabling an effective lock; keeping it restores the tick; unlocking saves with the tick remaining cleared after reload and writes `performance.cycle_lock_disabled`. Editing only the deadline does not show this checkbox-specific confirmation. |
| Manager | On **Appraisals**, begin an appraisal in an unlocked cycle, enter score and feedback, then select the locked cycle. | A formatted locked badge appears, save/submit actions disable, and all entered feedback stays in the mounted form. Switching back to an unlocked cycle re-enables actions without losing text. |
| Employee | On **My appraisals**, open a manager-submitted appraisal belonging to the locked cycle and acknowledge it. | Acknowledge remains available after the deadline; status becomes `acknowledged` and audit row `performance.review_acknowledged` is written. |

Deadline pass/fail is evaluated in the configured Settings timezone (`app_settings.timezone`), with Mauritius as the resilience fallback for absent or invalid stored configuration.

## What to check on the next dashboard refresh

- **Admin's dashboard:** Performance reviews metric reflects the new submitted/acknowledged review.
- **Manager's dashboard:** Open reviews count down by 1 once Alice acknowledges. Recent updates shows the manager submission + acknowledgment.
- **Alice's dashboard:** Active goals reflects her progress edit. Acknowledged review appears in Recent updates.

## Cleanup

- The UAT cycle, goal, and review remain in history (intentional — audit / reporting integrity). Don't delete via SQL.
- For the next rotation, simply pick a new cycle title and new goal title; the seed users can carry indefinite historical cycles.
- `npm run cleanup:e2e-data` removes only Playwright-prefixed cycles/goals.

## Notes for the reviewer

If step 9's workspace doesn't show the cycle-first / employee-second flow, that's a Batch 12 regression (Session 98). If step 10's draft is **visible to Alice**, that's a Phase 13 regression (employee should not see manager's draft until submit — file as critical RLS issue). If step 13's acknowledgment task doesn't surface in Alice's Action items, that's a Session 89 regression on the manager-submitted → employee-action feedback loop.


 ## Findings 27-May26
 - For 3, manager sign in and create goal, why does a popup localhost:3000 appear?   This behaviour is not aligned with other behaviours in the app, for confirmation.  Please align.  I think this was changed by codex in previous sessions.  See screenshot popup1.png in the screenshots folder.  I dont think for this case, there needs to be this confirmation.  Also, after creating a goal for Alice, if I want to create another goal for Bob, I have to delete the things i have put for alice?  See persistent after change 1.png.  I think the goal just created should disappear right?  and if i want to create another, i should be able to click on create another goal.
Additionally, think of how this can be made easy for the manager. He gets on the goals page, selects the review cycle relevant,  sees all of his employees, selects the one, or the ones he wants, creates goals for them for this cycle.  See how this can be made more intuitive.  
 - For 4, i cannot even select Bob.  I i put Bob in the field, and click create and submit, it thinks that the employee field is blank.  I think that is ok, i don't need to see other employees. 
 - For 5, employee goals, review the layout, it is not pleasing to the eye, the progress is a small box, the progress note is large.  The rows are not differentiable to the eye.  Do a research on how goals appear, and adapt it.  if you want i can research and provide with screenshots. See screenshot ugly.png in the screenshots folder. Also think of grouping them by review cycle, so if i click one review cycle, then the goals for that revew appears, does it make sense?
  - For 5, after clicking the reviews tab, Previously "My Appraisals", I don't see the new review cycle just created "UAT Goal Q1 outcomes".  Cannot perform uat 7.
  - For 9, i can see the cycle goals for Alice, and an empty self review form, the goal is correctly updated to 60%.  When I went back to log in as Alice, I can now suddenly see the UAT cycle in the "Reviews" tab.  Take note of Codex's changes to the layout here, previously.  Also, I cannot see any manager's review yet.  But, it would be good to see somehting to indicate that the review is pending on the manager's side, correct.
   - I went back to 7  and successfully submitted the self-review.  See screenshot dupsreview.png, you can see how it appears duplicated?  I think a simple edit would have been ok? instead of duplicating, let me know.  Also, after saving self review again, the edit button does not appear, it appears as Save self-review and Discard changes.  Shouldn't only edit appear? discard changes should appear only after i added some text, or perhaps, discard changes should not be there at all.  Let us decide.
- for 11, when going back to Alice to check, UAT cycle appears, but there is not manager review pending message.  See screenshot:nomanagerpending.png in screenshots.
- for 12, great, manager submitted.  But see screenshot alice review in alicesubmitted.png:  She has submitted her self review, but it still appears as Reviewing.
- for 13, in recent updates, the message for Manager submitted review does not appear, the latest message is Review ready for acknowledgement.  Ok, i think it's good here. i don't think any action needed here.
- for 14, i see the reviews the manager has written, strenght, improvement areas, next steps, but not the score.  Oh, now i see the score on the far right, a small 5/5.  How can we make the score more visible? See screenshot score.png.
- for 15, i was able to edit the score to 1/5, and it was saved! see editedscore.png.  Ok i think i had not acknowledged on alice's side.  After acknowledging, i see the message, "Acknowledged appraisals are final..." and also cannot see any edit button.  So i think this is good, but as mentioned, alice's side on the appraisal workspace is still showing reviewing.
- For Codex's lock cycle walthrought, see locked.png in screenshots.  Can it be made more beautiful and professional, if it is a small change?

## Severity ranking and remediation batches (27May26)

Captured after the full UAT rotation completed. Findings above are grouped into severity tiers and batched by file/area to minimise churn.

### Severity tiers

**High** — incorrect guard behavior / lifecycle / process
- F1: ✅ Closed 2026-05-27 (B1) — auto-create `performance_reviews` row on goal creation. See Remediation log.
- F2: ✅ Closed 2026-05-27 (B1) — simplified `!editing` guard + removed duplicate self-review text. See Remediation log.
- F3: ✅ Closed 2026-05-27 (B1) — folded into F2 fix (same guard controlled both symptoms). See Remediation log.
- F4: ✅ Closed 2026-05-27 (B1) — dynamic `formatEnum(review?.status)` in workspace header. See Remediation log.

**Medium** — UX gaps / missing affordances
- F5: ✅ Closed 2026-05-27 (B2) — removed `window.confirm()`, single "Submit" button. See Remediation log.
- F6: ✅ Closed 2026-05-27 (B2) — auto-reset with sticky cycle after creation. See Remediation log.
- F7: ✅ Closed 2026-05-27 (B3) — cycle-grouped card layout with full-width progress bars. See Remediation log.
- F8: ✅ Closed 2026-05-27 (B1) — "Pending manager review" indicator in ReviewList. See Remediation log.
- F9: ✅ Closed 2026-05-27 (B2) — kept per-employee form with "Re-submit" label for edit path; cycle-first deferred. See Remediation log.
- F10: ✅ Closed 2026-05-27 (B3) — goals grouped by cycle with collapsible `<details>` sections. See Remediation log.

**Low** — polish
- F11: ✅ Closed 2026-05-27 (B4) — score promoted to prominent amber star badge (`text-sm font-bold`). See Remediation log.
- F12: ✅ Closed 2026-05-27 (B4) — all locked surfaces polished with lock icons, accent borders, refined layout. See Remediation log.

### Remediation batches

| Batch | Findings | Surface area | Severity | Notes |
|---|---|---|---|---|
| **B1** Review lifecycle & status | F1, F2, F3, F4, F8 | ✅ Closed 2026-05-27 (Claude). `src/server/actions/performance.ts`: auto-create `performance_reviews` row on goal creation with `maybeSingle` idempotency + audit log `performance.review_bootstrapped`. `src/components/performance/performance-forms.tsx`: SelfReviewForm guard simplified to `!editing`, duplicate self-review text removed, workspace header status dynamic via `formatEnum(review?.status)`. `src/components/performance/performance-lists.tsx`: "Pending manager review" indicator added to ReviewList. QA/review/uiux agents passed clean. | High | Root cause of F1: `performance_reviews` rows only created in `submitManagerReview` — bootstrapped on goal creation now. |
| **B2** Goal creation form | F5, F6, F9 | ✅ Closed 2026-05-27 (Claude). `src/components/performance/performance-forms.tsx`: removed `window.confirm()` and draft/submit split — single "Submit" button (always locks), "Re-submit" on edit path. `prevSuccess` auto-reset with sticky cycle after creation. `messageDismissed` flag clears stale success messages on goal switch / lock transitions. Inline-only success (FormMessage suppressed on success). `aria-live` added to `InlineSaveStatus`. `tests/e2e/manager.spec.ts` + `tests/e2e/admin.spec.ts`: 8 button locators + success message assertions updated. QA/review/uiux agents passed; aria-live fix auto-applied. | Medium | F9 decision: kept per-employee form, deferred cycle-first redesign. |
| **B3** Goal list display | F7, F10 | ✅ Closed 2026-05-27 (Claude). `src/components/performance/performance-lists.tsx`: replaced flat `<table>` GoalList with cycle-grouped collapsible `<details>` cards — full-width progress bars, clear card separation, cycle header with goal count, employee name links for manager view. | Medium | User chose cycle grouping over flat table. |
| **B4** Score & lock polish | F11, F12 | ✅ Closed 2026-05-27 (Claude). `src/components/performance/performance-lists.tsx`: score promoted from `text-xs` StatusBadge to amber star badge (`text-sm font-bold`, lucide Star icon, amber-300 border). `src/components/performance/performance-forms.tsx`: DeadlineLockedBadge upgraded with Lock icon + `text-sm`; amber warning box restructured with lock icon left-aligned layout; LockedGoalSummary + LockedManagerReviewSummary cards given `border-t-2 border-t-primary/40` accent and lock icons on status badges; score in LockedManagerReviewSummary promoted to prominent star badge (moved out of `dl` grid). | Low | All 12 findings now closed. |

### Recommended sequencing

1. **B1** — review lifecycle correctness; blocks accurate UAT pass on remaining steps.
2. **B2 → B3** — goal creation then display; B2 has a product question (F9) that may reshape B3's grouping approach.
3. **B4** — polish; no functional impact.

### Open product questions

- **B2 (F9)** — Goal creation UX: should the flow be cycle-first (select cycle → see all direct reports → create goals), or keep per-employee form with better reset? User offered to research and provide screenshots.
- **B3 (F10)** — Should employee goals be grouped by review cycle (collapsible sections), or remain a flat table with better visual separation?
- **B4 (F12)** — ✅ Resolved: user chose "polish all locked surfaces." Scope confirmed at session start.

### Remediation log

**B1 — Review lifecycle & status (F1, F2, F3, F4, F8)** — Closed Session 139 (2026-05-27). F1: auto-create `performance_reviews` row on goal creation + audit log. F2+F3: simplified `!editing` guard + removed duplicate self-review text. F4: dynamic `formatEnum(review?.status)` in workspace header. F8: "Pending manager review" indicator in ReviewList. QA/review/uiux agents passed clean.

**B2 — Goal creation form (F5, F6, F9)** — Closed Session 139 (2026-05-27). F5: removed `window.confirm()`, single "Submit" button (no draft/submit split). F6+F9: auto-reset with sticky cycle after creation, "Re-submit" label for edit path, inline-only success message with auto-dismiss on interaction. Test locators updated across manager.spec.ts + admin.spec.ts. QA/review/uiux agents passed; aria-live fix auto-applied.

**B3 — Goal list display (F7, F10) + UX polish** — Closed Session 141 (2026-05-27). Replaced flat `<table>` GoalList with cycle-grouped collapsible cards. F7: card-based layout with clear visual separation between goals, employee name links for manager/admin view. F10: goals grouped by `cycleId`, each group in a collapsible `<details>` element with cycle title + goal count header (collapsed by default). Additional UX improvements requested during smoke test: (a) circular SVG progress ring (40px donut with percentage centered) replacing linear bar — matches professional HRMS reference; (b) EmployeeGoalProgressForm rearranged to stacked layout (note full-width on top, progress + Complete + Save in horizontal row below); (c) Complete checkbox styled as bordered pill with `has-[:checked]` primary highlight; (d) performance page MetricCards given `note` props ("X total" / "X active") to match dashboard pattern. Also fixed: success message invisible after goal submit-and-lock (`InlineSaveStatus` rendered above locked/unlocked branch); 2 test locators using old "Submit" label (→ "Re-submit" for existing goals); flaky `toBeAttached` race on cycle group; slow-action timeouts bumped to 10s.

**B4 — Score & lock polish (F11, F12)** — Closed Session 142 (2026-05-27). F11: replaced `text-xs` slate StatusBadge score with prominent amber star badge — `text-sm font-bold`, lucide `Star` icon (filled amber-500), amber-300 border. Applied in ReviewList (employee view), ManagerReviewList (manager view), and LockedManagerReviewSummary (promoted out of `dl` grid into standalone badge). F12: polished all locked surfaces — DeadlineLockedBadge upgraded with lucide `Lock` icon + `text-sm` + stronger amber-300 border; amber warning box in ManagerAppraisalForm restructured with lock icon left-aligned via `flex items-start gap-3`; LockedGoalSummary + LockedManagerReviewSummary cards given `border-t-2 border-t-primary/40` accent strip and lock icons on "Submitted"/"Acknowledged" status badges. No test changes needed (text matchers `Score X/5` unchanged). All 12 performance-cycle UAT findings now closed.