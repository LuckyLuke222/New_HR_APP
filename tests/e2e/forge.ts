// Server Action forge helper for security/RBAC tests.
//
// Mirrors the manual UAT "Forge methodology" in
// docs/uat-flows/security-and-rbac-guards.md: capture a legitimate Server
// Action POST from a rendered form, swap one UUID in the multipart body,
// replay it from the same authenticated context, and assert the server-side
// guard rejected it.
//
// The helper works at the network layer (route capture + page.request.post),
// not the DOM. React-controlled inputs cannot silently revert the swap, which
// is the false-negative trap that defeated Session 122's first attempt.

import { expect, type Page, type Request } from "@playwright/test";

import { supabaseAdmin } from "./helpers";

export type CapturedAction = {
  url: string;
  body: Buffer; // raw bytes — multipart bodies may contain binary file payloads
  headers: Record<string, string>;
};

export async function captureServerAction(
  page: Page,
  trigger: () => Promise<void>,
): Promise<CapturedAction> {
  const captured = new Promise<CapturedAction>((resolve, reject) => {
    const onRequest = (req: Request) => {
      if (req.method() !== "POST") return;
      const headers = req.headers();
      if (!headers["next-action"]) return;
      // postDataBuffer() returns raw bytes including binary file payloads.
      // postData() returns null for multipart bodies with File entries —
      // that's the trap that broke uploadDocument captures.
      const buf = req.postDataBuffer();
      if (!buf) {
        reject(new Error("captured Server Action POST had no body"));
        return;
      }
      page.off("request", onRequest);
      resolve({ url: req.url(), body: buf, headers });
    };
    page.on("request", onRequest);
    setTimeout(() => {
      page.off("request", onRequest);
      reject(new Error("captureServerAction timed out after 15s — did the form submit?"));
    }, 15_000);
  });
  await trigger();
  return captured;
}

export async function forgeAndReplay(
  page: Page,
  captured: CapturedAction,
  find: string,
  replace: string,
): Promise<{ status: number; body: string }> {
  // UUIDs and other identifiers are pure ASCII, so it's safe to swap them at
  // the byte level even when the surrounding multipart body contains binary.
  const findBuf = Buffer.from(find, "utf8");
  const replaceBuf = Buffer.from(replace, "utf8");
  const idx = captured.body.indexOf(findBuf);
  if (idx === -1) {
    throw new Error(
      `forge target '${find}' not present in captured body — seed/capture mismatch`,
    );
  }
  const forged = Buffer.concat([
    captured.body.subarray(0, idx),
    replaceBuf,
    captured.body.subarray(idx + findBuf.length),
  ]);
  const response = await page.request.post(captured.url, {
    headers: {
      "next-action": captured.headers["next-action"],
      "content-type": captured.headers["content-type"],
      accept: "text/x-component",
    },
    data: forged,
  });
  return { status: response.status(), body: await response.text() };
}

export async function expectDenyAudit({
  actorId,
  entityId,
  reason,
  since,
}: {
  actorId: string;
  entityId?: string;
  reason?: string;
  since: string;
}): Promise<void> {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id, actor, entity_id, metadata, created_at")
    .eq("action", "auth.access_denied")
    .eq("actor", actorId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  expect(error).toBeNull();
  expect(
    data?.length,
    `expected an auth.access_denied row for actor ${actorId}` +
      (entityId ? ` with entity_id=${entityId}` : "") +
      (reason ? ` and reason=${reason}` : "") +
      ` after ${since} — none found`,
  ).toBeGreaterThan(0);

  if (reason) {
    const hit = data?.find(
      (row) => (row.metadata as { reason?: string } | null)?.reason === reason,
    );
    expect(hit, `no audit row matched reason=${reason}`).toBeTruthy();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
