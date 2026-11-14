import { test, expect, Page } from "@playwright/test";
import { createHash } from "node:crypto";
const small = Buffer.from("synthetic resumable upload\n");
const partSize = 8 * 1024 * 1024;
const video = Buffer.alloc(partSize + 19, 65);
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const session = (status = "CREATED") => ({
  sessionId: "session-1", fileId: "file-1", uploadMode: "SINGLE", partSizeBytes: partSize,
  expiresAt: "2099-01-01T00:00:00Z", status,
  confirmedParts: [] as { number: number; sizeBytes: number; sha256: string }[],
});
const file = (data = small) => ({
  id: "file-1", filename: "fixture.txt", category: "CONNECTION_DOCUMENT", contentType: "text/plain",
  sizeBytes: data.length, sha256: sha(data), status: "AVAILABLE", storage: "S3", integrityStatus: "VERIFIED",
  owner: "admin", policyVersion: "1", routingReason: "fixture", createdAt: "2026-11-14T10:00:00Z",
});
const saved = (sessionId = "session-1", username = "admin") => ({
  username, hash: sha(small), category: "CONNECTION_DOCUMENT", filename: "fixture.txt",
  sizeBytes: small.length, contentType: "text/plain", sessionId,
  contextKey: JSON.stringify({ incidentId: "", applicationId: "DEMO-001", documentType: "APPLICATION",
    attachmentType: "BINARY", sensitivity: "SENSITIVE" }),
});
function gate() {
  let release!: () => void;
  return { promise: new Promise<void>(r => release = r), release: () => release() };
}
async function signIn(page: Page, username = "admin") {
  await page.getByLabel("Utilizator").fill(username);
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reîmprospătează", exact: true })).toBeEnabled();
}
async function choose(page: Page, data = small, category = "CONNECTION_DOCUMENT") {
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("combobox", { name: "Categorie", exact: true }).selectOption(category);
  await page.locator("input[type=file]").setInputFiles({ name: "fixture.txt", mimeType: "text/plain", buffer: data });
}
const uploadButton = (page: Page) => page.getByRole("button", { name: "Încarcă / reia transferul" });
const start = (page: Page) => uploadButton(page).click();
const references = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("filegrid.uploads") || "[]"));
const seed = (page: Page, values: ReturnType<typeof saved>[]) => page.evaluate(
  values => localStorage.setItem("filegrid.uploads", JSON.stringify(values)), values,
);
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/me")) {
      const connection = route.request().headers()["authorization"] === "Basic " + Buffer.from("connection:fixture").toString("base64");
      await route.fulfill({ json: { username: connection ? "connection" : "admin", role: connection ? "CONNECTION_AGENT" : "ADMIN" } });
    } else if (["/files", "/incidents", "/meter-readings"].some(x => path.endsWith(x)))
      await route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    else if (path.endsWith("/stats/business"))
      await route.fulfill({ json: { files: 0, incidents: 0, readings: 0, mode: "NORMAL", recentIncidents: 0, zones: [] } });
    else if (path.endsWith("/stats/technical")) await route.fulfill({ json: { series: [] } });
    else if (path.endsWith("/upload-sessions")) await route.fulfill({ status: 201, json: session() });
    else if (path.endsWith("/upload-sessions/session-1/complete")) await route.fulfill({ status: 202, json: file() });
    else if (path.endsWith("/files/file-1")) await route.fulfill({ json: file() });
    else if (path.includes("/upload-sessions/session-1"))
      await route.fulfill(route.request().method() === "DELETE" ? { status: 204 } : { json: session() });
    else throw new Error("Unexpected fixture API: " + route.request().method() + " " + path);
  });
  await page.goto("/");
});
test("pause and logout terminate hashing without creating a session or leaking old state", async ({ page }) => {
  await page.evaluate(() => {
    const RealWorker = window.Worker;
    (window as any).terminated = 0;
    window.Worker = class extends RealWorker {
      override postMessage() { /* Hold hashing until stopped. */ }
      override terminate() { (window as any).terminated++; super.terminate(); }
    };
  });
  let creates = 0;
  await page.route("**/api/v1/upload-sessions", route => { creates++; return route.fulfill({ json: session() }); });
  await signIn(page); await choose(page); await start(page);
  await page.getByRole("button", { name: "Pauză", exact: true }).click();
  await expect(uploadButton(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as any).terminated)).toBe(1);
  expect(creates).toBe(0);
  await start(page);
  await page.getByRole("button", { name: "Deconectare", exact: true }).click();
  await signIn(page, "connection");
  expect(await page.evaluate(() => (window as any).terminated)).toBe(2);
  await choose(page);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator(".hash")).toHaveCount(0);
});
test("lost creation response retries the persisted idempotency key and sends original bytes", async ({ page }) => {
  const keys: string[] = [];
  let body: unknown;
  await page.route("**/api/v1/upload-sessions", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    const payload = route.request().postDataJSON();
    if (body) expect(payload).toEqual(body); else body = payload;
    expect((await references(page))[0].idempotencyKey).toBe(keys[0]);
    if (keys.length === 1) await route.abort("failed");
    else await route.fulfill({ status: 201, json: session() });
  });
  await page.route("**/api/v1/upload-sessions/session-1/content", async route => {
    expect(route.request().postDataBuffer()).toEqual(small);
    expect(route.request().headers()["content-type"]).toBe("application/octet-stream");
    await route.fulfill({ json: session("UPLOADED") });
  });
  await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  expect(keys).toHaveLength(2); expect(new Set(keys).size).toBe(1);
  expect(await references(page)).toEqual([]);
});
test("pause during creation survives reload and replays the original key", async ({ page }) => {
  const keys: string[] = [], held = gate(), started = gate();
  await page.route("**/api/v1/upload-sessions", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) { started.release(); await held.promise; }
    await route.fulfill({ status: 201, json: session() });
  });
  await signIn(page); await choose(page); await start(page); await started.promise;
  await page.getByRole("button", { name: "Pauză", exact: true }).click();
  await expect(uploadButton(page)).toBeEnabled();
  await page.reload(); await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  held.release();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});
test("multipart resumes after reload, skips confirmed chunks and sends valid chunk hashes", async ({ page }) => {
  const multipart = { ...session(), uploadMode: "MULTIPART" }, sent: number[] = [];
  const held = gate(), started = gate();
  await page.route("**/api/v1/upload-sessions", route => route.fulfill({ status: 201, json: multipart }));
  await page.route("**/api/v1/upload-sessions/session-1", route => route.fulfill({ json: multipart }));
  await page.route("**/api/v1/upload-sessions/session-1/parts/*", async route => {
    const number = Number(route.request().url().split("/").pop());
    const data = route.request().postDataBuffer()!;
    expect(data.equals(video.subarray((number - 1) * partSize, number * partSize))).toBe(true);
    expect(route.request().headers()["x-part-sha256"]).toBe(sha(data));
    sent.push(number);
    if (number === 2 && sent.filter(n => n === 2).length === 1) { started.release(); await held.promise; }
    multipart.confirmedParts.push({ number, sizeBytes: data.length, sha256: sha(data) });
    await route.fulfill({ json: multipart });
  });
  await page.route("**/api/v1/files/file-1", route => route.fulfill({ json: file(video) }));
  await signIn(page); await choose(page, video, "DRONE_VIDEO"); await start(page); await started.promise;
  await page.getByRole("button", { name: "Pauză", exact: true }).click();
  await expect(uploadButton(page)).toBeEnabled();
  await page.reload(); await signIn(page); await choose(page, video, "DRONE_VIDEO"); await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  held.release();
  expect(sent.filter(n => n === 1)).toHaveLength(1);
  expect(sent.filter(n => n === 2)).toHaveLength(2);
  await expect(page.locator(".hash code")).toHaveText(sha(video));
});
for (const state of ["expired", "CANCELLED", "missing"] as const) {
  test(`${state} session offers targeted recovery preserving another account`, async ({ page }) => {
    await seed(page, [saved(), saved("other", "connection")]);
    await page.route("**/api/v1/upload-sessions/session-1", route => state === "missing"
      ? route.fulfill({ status: 404, json: { code: "NOT_FOUND", detail: "Session not found" } })
      : route.fulfill({ json: { ...session(state === "expired" ? "UPLOADING" : state),
        expiresAt: state === "expired" ? "2000-01-01T00:00:00Z" : session().expiresAt } }));
    let creates = 0;
    await page.route("**/api/v1/upload-sessions", route => { creates++; return route.fulfill({ status: 201, json: session() }); });
    await signIn(page); await choose(page); await start(page);
    const restart = page.getByRole("button", { name: "Începe o sesiune nouă", exact: true });
    await expect(restart).toBeEnabled(); expect(creates).toBe(0);
    await restart.click();
    await expect(page.getByRole("status")).toContainText("Fișier disponibil");
    expect(creates).toBe(1);
    expect(await references(page)).toEqual([saved("other", "connection")]);
  });
}
test("EXPIRED during content upload offers recovery", async ({ page }) => {
  await page.route("**/api/v1/upload-sessions/session-1/content", route => route.fulfill({ status: 409, json: { code: "EXPIRED", detail: "Session expired" } }));
  await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("button", { name: "Începe o sesiune nouă", exact: true })).toBeEnabled();
  expect(await references(page)).toHaveLength(1);
});
test("pause interrupts retry backoff without another request", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/upload-sessions/session-1/content", route => {
    requests++; return route.fulfill({ status: 503, json: { detail: "Storage temporarily unavailable" } });
  });
  await signIn(page); await choose(page); await start(page);
  await expect(page.locator(".progress-label")).toContainText("reîncercare 1");
  await page.getByRole("button", { name: "Pauză", exact: true }).click();
  await expect(uploadButton(page)).toBeEnabled();
  await page.waitForTimeout(1200); expect(requests).toBe(1);
});
test("verification polling stops and resume does not upload or finalize again", async ({ page }) => {
  let polls = 0, available = false, completions = 0, contents = 0;
  await page.route("**/api/v1/upload-sessions/session-1", route => route.fulfill({ json: session("VERIFYING") }));
  await page.route("**/api/v1/upload-sessions/session-1/content", route => { contents++; return route.fulfill({ json: session("UPLOADED") }); });
  await page.route("**/api/v1/upload-sessions/session-1/complete", route => { completions++; return route.fulfill({ status: 202, json: file() }); });
  await page.route("**/api/v1/files/file-1", route => { polls++; return route.fulfill({ json: { ...file(), status: available ? "AVAILABLE" : "VERIFYING" } }); });
  await signIn(page); await choose(page); await start(page);
  await expect.poll(() => polls).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Oprește urmărirea", exact: true }).click();
  await expect(uploadButton(page)).toBeEnabled();
  const stoppedAt = polls;
  await page.waitForTimeout(1200); expect(polls).toBe(stoppedAt);
  available = true; await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  expect(contents).toBe(1); expect(completions).toBe(1);
});
for (const denied of [false, true]) {
  test(`server cancellation ${denied ? "denial retains" : "success removes only"} current recovery data`, async ({ page }) => {
    const held = gate(), started = gate();
    await seed(page, [saved("other", "connection")]);
    await page.route("**/api/v1/upload-sessions/session-1/content", async route => { started.release(); await held.promise; await route.fulfill({ json: session("UPLOADED") }); });
    let deletes = 0;
    await page.route("**/api/v1/upload-sessions/session-1", route => {
      expect(route.request().method()).toBe("DELETE"); deletes++;
      return denied ? route.fulfill({ status: 403, json: { detail: "Denied", correlationId: "cancel-denied" } }) : route.fulfill({ status: 204 });
    });
    await signIn(page); await choose(page); await start(page); await started.promise;
    await page.getByRole("button", { name: "Anulează transferul", exact: true }).click();
    await expect(uploadButton(page)).toBeEnabled(); held.release();
    expect(deletes).toBe(1);
    const local = await references(page);
    expect(local.some((x: any) => x.username === "admin")).toBe(denied);
    expect(local.some((x: any) => x.username === "connection")).toBe(true);
    if (denied) await expect(page.getByRole("alert")).toContainText("cancel-denied");
    else await expect(page.getByRole("status")).toContainText("Transfer anulat");
  });
}
test("different reselected bytes create a distinct session and preserve the original reference", async ({ page }) => {
  await seed(page, [saved()]);
  const changed = Buffer.from("different bytes"); let creates = 0;
  await page.route("**/api/v1/upload-sessions", async route => {
    creates++; expect(route.request().postDataJSON().sha256).toBe(sha(changed));
    await route.fulfill({ status: 201, json: { ...session(), sessionId: "session-2" } });
  });
  await page.route("**/api/v1/upload-sessions/session-2/**", route => route.fulfill({ json: session("UPLOADED") }));
  await signIn(page); await choose(page, changed); await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  expect(creates).toBe(1); expect(await references(page)).toEqual([saved()]);
});
test("403 content failure is not retried and preserves the session without success", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/upload-sessions/session-1/content", route => {
    requests++; return route.fulfill({ status: 403, json: { detail: "Denied", correlationId: "upload-denied" } });
  });
  await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("alert")).toContainText("upload-denied");
  expect(requests).toBe(1); expect(await references(page)).toHaveLength(1);
  await expect(page.getByRole("status")).toHaveCount(0);
});
test("clearing references is scoped to the current account", async ({ page }) => {
  await seed(page, [saved(), saved("other", "connection")]);
  await signIn(page); await choose(page);
  await page.getByRole("button", { name: "Elimină referințele locale ale contului", exact: true }).click();
  expect(await references(page)).toEqual([saved("other", "connection")]);
});
for (const outcome of ["missing", "verifying", "response-lost"] as const) {
  test(`cancel ${outcome} reconciles the server state without false success`, async ({ page }) => {
    const held = gate(), started = gate(); let deletes = 0;
    await page.route("**/api/v1/upload-sessions/session-1/content", async route => {
      started.release(); await held.promise; await route.fulfill({ json: session("UPLOADED") });
    });
    await page.route("**/api/v1/upload-sessions/session-1", route => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: session(outcome === "response-lost" ? "CANCELLED" : "VERIFYING") });
      deletes++;
      if (outcome === "response-lost") return route.abort("failed");
      return route.fulfill({ status: outcome === "missing" ? 404 : 409,
        json: { code: outcome === "missing" ? "NOT_FOUND" : "UPLOAD_STATE", detail: "Session changed" } });
    });
    await signIn(page); await choose(page); await start(page); await started.promise;
    await page.getByRole("button", { name: "Anulează transferul", exact: true }).click();
    if (outcome === "missing") {
      await expect(page.getByRole("button", { name: "Începe o sesiune nouă", exact: true })).toBeEnabled();
      await expect(page.getByRole("combobox", { name: "Categorie", exact: true })).toBeDisabled();
      await expect(page.getByRole("textbox", { name: "ID cerere", exact: true })).toBeDisabled();
      expect(await references(page)).toHaveLength(1);
    } else if (outcome === "verifying") {
      await expect(page.getByRole("alert")).toContainText("Session changed");
      await expect(page.getByRole("button", { name: "Anulează transferul", exact: true })).toHaveCount(0);
      expect(await references(page)).toHaveLength(1);
      await start(page);
      await expect(page.getByRole("status")).toContainText("Fișier disponibil");
    } else {
      await expect(page.getByRole("status")).toContainText("Transfer anulat", { timeout: 12000 });
      expect(deletes).toBe(5);
      expect(await references(page)).toEqual([]);
    }
    held.release();
  });
}
for (const operation of ["upload", "cancel"] as const) {
  test(`logout during ${operation} keeps the next account free of old results`, async ({ page }) => {
    const held = gate(), started = gate(), deleting = gate();
    await page.route("**/api/v1/upload-sessions/session-1/content", async route => {
      started.release(); await held.promise; await route.fulfill({ json: session("UPLOADED") });
    });
    if (operation === "cancel") await page.route("**/api/v1/upload-sessions/session-1", async route => {
      deleting.release(); await held.promise; await route.fulfill({ status: 204 });
    });
    await signIn(page); await choose(page); await start(page); await started.promise;
    if (operation === "cancel") {
      await page.getByRole("button", { name: "Anulează transferul", exact: true }).click();
      await deleting.promise;
    }
    await page.getByRole("button", { name: "Deconectare", exact: true }).click();
    await signIn(page, "connection"); held.release();
    await choose(page);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".hash")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anulează transferul", exact: true })).toHaveCount(0);
    const local = await references(page);
    expect(local).toHaveLength(1); expect(local[0].username).toBe("admin");
  });
}
test("retry exhaustion preserves a recoverable reference and a subsequent resume succeeds", async ({ page }) => {
  let requests = 0, available = false;
  await page.route("**/api/v1/upload-sessions/session-1/content", route => {
    requests++;
    return available ? route.fulfill({ json: session("UPLOADED") })
      : route.fulfill({ status: 503, json: { detail: "Storage temporarily unavailable" } });
  });
  await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("alert")).toContainText("Storage temporarily unavailable", { timeout: 12000 });
  expect(requests).toBe(5); expect(await references(page)).toHaveLength(1);
  available = true; await start(page);
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  expect(requests).toBe(6); expect(await references(page)).toEqual([]);
});
test("local persistence failure prevents creating an untracked server session", async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage quota exceeded", "QuotaExceededError"); };
  });
  let creates = 0;
  await page.route("**/api/v1/upload-sessions", route => { creates++; return route.fulfill({ json: session() }); });
  await signIn(page); await choose(page); await start(page);
  await expect(page.getByRole("alert")).toContainText("Storage quota exceeded");
  expect(creates).toBe(0);
});
for (const category of ["CONNECTION_DOCUMENT", "INCIDENT", "DRONE_VIDEO"]) {
  test(`saved ${category} restores non-default context after reload without creating a new session`, async ({ page }) => {
    const context = { incidentId: category === "INCIDENT" ? "incident-outside-first-page" : "",
      applicationId: category === "CONNECTION_DOCUMENT" ? "CUSTOM-APPLICATION" : "",
      documentType: "CUSTOM-DOCUMENT", attachmentType: "LEGACY_LOG", sensitivity: "NON_SENSITIVE" };
    if (category === "CONNECTION_DOCUMENT") context.sensitivity = "SENSITIVE";
    const reference = { ...saved(), category, contextKey: JSON.stringify(context) };
    await seed(page, [reference]); await page.reload(); await signIn(page);
    await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
    await page.getByRole("button", { name: "Reia fixture.txt", exact: false }).click();
    await expect(page.getByRole("combobox", { name: "Categorie", exact: true })).toHaveValue(category);
    if (category === "CONNECTION_DOCUMENT") await expect(page.getByRole("textbox", { name: "ID cerere", exact: true })).toHaveValue("CUSTOM-APPLICATION");
    if (category === "INCIDENT") await expect(page.getByRole("combobox", { name: "Incident asociat", exact: true })).toHaveValue(context.incidentId);
    let creates = 0, resumed = 0;
    await page.route("**/api/v1/upload-sessions", route => { creates++; return route.fulfill({ json: session() }); });
    await page.route("**/api/v1/upload-sessions/session-1", route => { resumed++; return route.fulfill({ json: session("UPLOADED") }); });
    // Browser-reported MIME can differ after reselect; the original declaration is preserved.
    await page.locator("input[type=file]").setInputFiles({ name: "fixture.txt", mimeType: "application/octet-stream", buffer: small });
    await start(page);
    await expect(page.getByRole("status")).toContainText("Fișier disponibil");
    expect(creates).toBe(0); expect(resumed).toBe(1); expect(await references(page)).toEqual([]);
  });
}
test("explicit saved-session selection rejects different bytes before any session API call", async ({ page }) => {
  await seed(page, [saved()]); await signIn(page);
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("button", { name: "Reia fixture.txt", exact: false }).click();
  let requests = 0;
  await page.route("**/api/v1/upload-sessions**", route => { requests++; return route.fulfill({ json: session() }); });
  await page.locator("input[type=file]").setInputFiles({ name: "fixture.txt", mimeType: "text/plain", buffer: Buffer.from("wrong file") });
  await start(page);
  await expect(page.getByRole("alert")).toContainText("nu corespunde transferului salvat");
  expect(requests).toBe(0); expect(await references(page)).toEqual([saved()]);
});
