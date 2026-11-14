import { test, expect, Page } from "@playwright/test";
import { createHash } from "node:crypto";

const bytes = Buffer.from("verified fixture download\n");
const checksum = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const file = {
  id: "file-1", category: "INCIDENT", filename: "report.txt", contentType: "text/plain",
  sizeBytes: bytes.length, sha256: checksum(bytes), status: "AVAILABLE", integrityStatus: "VERIFIED",
  storage: "S3", owner: "admin", policyVersion: "1", routingReason: "fixture", createdAt: "2026-11-14T10:00:00Z",
};
const pageOf = <T,>(items: T[], page = 0, size = 25, total = items.length) => ({ items, page, size, total });
const emptyPage = pageOf<unknown>([]);
function incident(id: number, mlStatus: string, analysis: unknown = null) {
  return {
    id: `incident-${id}`, stationId: `ST-${id}`, zone: `Zone ${id % 3}`, eventType: "VOLTAGE_DROP",
    severity: id % 5 + 1, affectedCustomers: id * 10, mlStatus, analysis,
    attachments: [{ ...file, id: `file-${id}`, filename: `available-${id}.txt` }],
  };
}
function gate() {
  let release!: () => void;
  let started!: () => void;
  return { promise: new Promise<void>(r => release = r), started: new Promise<void>(r => started = r), release, start: () => started() };
}
async function signIn(page: Page, username = "admin") {
  await page.goto("/");
  await page.getByLabel("Utilizator").fill(username);
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
}
async function installWriter(page: Page, options: { failWrite?: boolean; holdWrite?: boolean } = {}) {
  await page.addInitScript(({ failWrite: shouldFail, holdWrite }) => {
    const target = window as typeof window & { __downloadChunks?: number[]; __writerEvents?: string[]; __releaseWriter?: () => void; __writerStarted?: boolean };
    target.__downloadChunks = [];
    target.__writerEvents = [];
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({ createWritable: async () => new WritableStream<Uint8Array>({
        async write(chunk) {
          target.__writerEvents!.push("write");
          if (shouldFail) throw new Error("Writer rejected chunk");
          if (holdWrite) {
            target.__writerStarted = true;
            await new Promise<void>(resolve => target.__releaseWriter = resolve);
          }
          target.__downloadChunks!.push(...chunk);
        },
        close() { target.__writerEvents!.push("close"); },
        abort() { target.__writerEvents!.push("abort"); },
      }) }),
    });
  }, options);
}
async function chooseFilesTab(page: Page) {
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
}
const authHeader = (username: string) => "Basic " + Buffer.from(`${username}:fixture`).toString("base64");

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const query = new URL(request.url()).searchParams;
    const username = request.headers()["authorization"] === authHeader("connection") ? "connection" : "admin";
    let value: unknown = {};
    if (path.endsWith("/me")) {
      const role: Record<string, string> = { admin: "ADMIN", dispatcher: "DISPATCHER", field: "FIELD_OPERATOR", connection: "CONNECTION_AGENT" };
      value = { username, role: role[username] || "ADMIN" };
    } else if (path.endsWith("/files") && request.method() === "GET") value = pageOf([file]);
    else if (path.endsWith("/files/file-1")) value = file;
    else if (path.endsWith("/files/file-1/content")) {
      await route.fulfill({ status: 200, contentType: "application/octet-stream", headers: { "X-Content-SHA256": file.sha256 }, body: bytes });
      return;
    } else if (path.endsWith("/stats/business")) value = { files: 1, readings: 2, incidents: 3, mode: "NORMAL", recentIncidents: 0, zones: [] };
    else if (path.endsWith("/stats/technical")) value = { windowMinutes: 60, series: [] };
    else if (path.endsWith("/incidents")) value = pageOf([], Number(query.get("page") || 0), 25, 0);
    else if (path.endsWith("/meter-readings")) value = pageOf([], Number(query.get("page") || 0), 25, 0);
    else if (path.endsWith("/policies")) value = { version: 1, rules: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  });
});

test("each role only requests endpoints granted by the existing API contract", async ({ page }) => {
  const observed: { username: string; path: string; status: number }[] = [];
  await page.route("**/api/v1/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const username = Object.entries({ admin: authHeader("admin"), dispatcher: authHeader("dispatcher"), field: authHeader("field"), connection: authHeader("connection") }).find(([, auth]) => auth === req.headers()["authorization"])?.[0] || "admin";
    const allowed = path.endsWith("/me") || path.endsWith("/files") || path.endsWith("/policies") ||
      (["admin", "dispatcher", "field"].includes(username) && path.endsWith("/incidents")) ||
      (["admin", "dispatcher"].includes(username) && ["/stats/business", "/stats/technical", "/meter-readings"].some(x => path.endsWith(x)));
    const status = allowed ? 200 : 403;
    observed.push({ username, path, status });
    const value = path.endsWith("/me") ? ({ username, role: ({ admin: "ADMIN", dispatcher: "DISPATCHER", field: "FIELD_OPERATOR", connection: "CONNECTION_AGENT" } as Record<string, string>)[username] })
      : path.endsWith("/files") || path.endsWith("/incidents") || path.endsWith("/meter-readings") ? emptyPage
      : path.endsWith("/stats/business") ? { files: 0, readings: 0, incidents: 0, mode: "NORMAL", recentIncidents: 0, zones: [] }
      : path.endsWith("/stats/technical") ? { windowMinutes: 60, series: [] } : { version: 1, rules: [] };
    await route.fulfill({ status, json: status === 200 ? value : { detail: "Forbidden", code: "FORBIDDEN" } });
  });
  for (const username of ["admin", "dispatcher", "field", "connection"]) {
    observed.length = 0;
    await signIn(page, username);
    await page.locator("nav button").filter({ hasText: "Politici de stocare" }).click();
    await expect(page.getByRole("heading", { name: "Politici de stocare." })).toBeVisible();
    const expected = username === "admin" || username === "dispatcher"
      ? ["/files", "/stats/business", "/incidents", "/meter-readings", "/stats/technical", "/policies"]
      : username === "field" ? ["/files", "/incidents", "/policies"] : ["/files", "/policies"];
    expect(observed.filter(x => x.status === 403)).toEqual([]);
    for (const endpoint of expected) expect(observed.some(x => x.path.endsWith(endpoint))).toBe(true);
    await page.getByRole("button", { name: "Deconectare", exact: true }).click();
  }
});

test("keyboard skip link and file details move focus to content and return it", async ({ page }) => {
  await signIn(page);
  const skipLink = page.getByRole("link", { name: "Sari la conținut" });
  for (let step = 0; step < 40 && !(await skipLink.evaluate(el => el === document.activeElement)); step++)
    await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-content")).toBeFocused();
  await chooseFilesTab(page);
  const trigger = page.getByRole("button", { name: "Detalii", exact: true });
  await trigger.click();
  await expect(page.locator("#file-details-heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("invalid incident data sends no POST and focuses the invalid field", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/v1/incidents", route => { if (route.request().method() === "POST") posts++; return route.fulfill({ json: { id: "unexpected" } }); });
  await signIn(page);
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.locator("#severity").fill("6");
  await page.getByRole("button", { name: "+ Creează incident" }).click();
  await expect(page.getByRole("alert")).toContainText("severitate între 1 și 5");
  await expect(page.locator("#severity")).toBeFocused();
  expect(posts).toBe(0);
});

test("responsive shell and content fit 320, 390, 768 and 1440 pixel viewports", async ({ page }) => {
  await signIn(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("technical dashboard shows the measured window, throughput, operations, quantiles and zone totals", async ({ page }) => {
  await page.route("**/api/v1/stats/business", route => route.fulfill({ json: { files: 3, readings: 4, incidents: 5, mode: "NORMAL", recentIncidents: 1, zones: [{ zone: "Dobrogea", incidents: 4 }, { zone: "Banat", incidents: 2 }] } }));
  await page.route("**/api/v1/stats/technical", route => route.fulfill({ json: { windowMinutes: 17, series: [{ category: "DRONE_VIDEO", storage: "S3", operation: "upload_part", operations: 8, bytesPerSecond: 12345, operationsPerSecond: 2.5, p50Ms: 10.2, p95Ms: 45.2, p99Ms: 91.1, errorRate: 0.125 }] } }));
  await signIn(page);
  await expect(page.getByText("Fereastră: 17 minute · valori măsurate")).toBeVisible();
  await expect(page.getByRole("cell", { name: "12.1 KiB/s" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2.5", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "45.2 ms" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "12.5%" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Avarii pe zone", exact: true }).getByText("Dobrogea", { exact: true })).toBeVisible();
  await expect(page.getByText("4 incidente", { exact: true })).toBeVisible();
});

test("section states distinguish loading, empty and recoverable error while keeping last data", async ({ page }) => {
  const pending = gate();
  await page.route("**/api/v1/stats/technical", async route => { pending.start(); await pending.promise; await route.fulfill({ json: { windowMinutes: 60, series: [] } }); });
  await page.goto("/");
  await page.getByLabel("Utilizator").fill("admin"); await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await pending.started;
  await expect(page.getByText("Se încarcă metricile tehnice…")).toBeVisible();
  await expect(page.locator("filegrid-section-state .section-state").filter({ hasText: "metricile tehnice" })).toHaveAttribute("aria-busy", "true");
  pending.release();
  await expect(page.getByText("Metricile apar după primele operații", { exact: false })).toBeVisible();
  let failed = false;
  await page.route("**/api/v1/stats/technical", route => failed
    ? route.fulfill({ json: { windowMinutes: 60, series: [] } })
    : route.fulfill({ status: 503, json: { detail: "Metrics temporarily unavailable" } }));
  await page.getByRole("button", { name: "Reîmprospătează" }).click();
  await expect(page.getByText("Metricile sunt indisponibile momentan.")).toBeVisible();
  await expect(page.getByText("Sunt afișate ultimele date primite.", { exact: false })).toBeVisible();
  failed = true;
  await page.getByRole("button", { name: "Reîncearcă metricile tehnice" }).click();
  await expect(page.getByText("Metricile apar după primele operații", { exact: false })).toBeVisible();
});

test("section error retains earlier measurements and identifies them as stale", async ({ page }) => {
  let failed = false;
  await page.route("**/api/v1/stats/technical", route => failed
    ? route.fulfill({ status: 503, json: { detail: "temporary" } })
    : route.fulfill({ json: { windowMinutes: 60, series: [{ category: "INCIDENT", storage: "S3", operation: "download", operations: 1, bytesPerSecond: 0, operationsPerSecond: 0, p50Ms: 2, p95Ms: 2, p99Ms: 2, errorRate: 0 }] } }));
  await signIn(page);
  await expect(page.getByRole("cell", { name: "2 ms" }).nth(1)).toBeVisible();
  failed = true;
  await page.getByRole("button", { name: "Reîmprospătează" }).click();
  await expect(page.getByText("Sunt afișate ultimele date primite.", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2 ms" }).nth(1)).toBeVisible();
});

test("normal and storm snapshots compare only observed API values", async ({ page }) => {
  let mode = "NORMAL";
  const measured = { category: "INCIDENT", storage: "S3", operation: "upload", operations: 2, bytesPerSecond: 2048, operationsPerSecond: 1, p50Ms: 5, p95Ms: 10, p99Ms: 15, errorRate: 0 };
  await page.route("**/api/v1/stats/business", route => route.fulfill({ json: { files: 2, readings: 2, incidents: 2, mode, recentIncidents: mode === "NORMAL" ? 1 : 30, zones: [] } }));
  await page.route("**/api/v1/stats/technical", route => route.fulfill({ json: { windowMinutes: 60, series: [{ ...measured, p95Ms: mode === "NORMAL" ? 10 : 80, bytesPerSecond: mode === "NORMAL" ? 2048 : 8192 }] } }));
  await signIn(page);
  await page.getByRole("button", { name: "Salvează instantaneul NORMAL" }).click();
  mode = "STORM";
  await page.getByRole("button", { name: "Reîmprospătează" }).click();
  await expect(page.getByRole("button", { name: "Salvează instantaneul STORM" })).toBeEnabled();
  await page.getByRole("button", { name: "Salvează instantaneul STORM" }).click();
  await expect(page.getByRole("region", { name: "Instantanee de performanță" })).toContainText("10 ms");
  await expect(page.getByRole("region", { name: "Instantanee de performanță" })).toContainText("80 ms");
  await expect(page.getByRole("region", { name: "Instantanee de performanță" })).toContainText("2.0 KiB/s");
  await expect(page.getByRole("region", { name: "Instantanee de performanță" })).toContainText("8.0 KiB/s");
  await expect(page.getByText("ferestrele pot fi suprapuse", { exact: false })).toBeVisible();
});

test("incident cards preserve AVAILABLE files for pending and failed ML and show three completed analysis panels", async ({ page }) => {
  const analysis = { priorityScore: 88.5, priorityClass: "HIGH", clusterId: 7, clusterSize: 3,
    recommendation: "HIGH_PRIORITY_REVIEW", reasons: ["synthetic impact reason", "nearby events"], synthetic: true,
    modelVersions: { impact: "rf-v3", correlation: "dbscan-v2" }, policyVersion: "decision-v4", timestamp: "2026-11-14T10:00:00Z" };
  const rows = [incident(1, "PENDING"), incident(2, "FAILED"), incident(3, "COMPLETED", analysis)];
  await page.route("**/api/v1/incidents?**", route => route.fulfill({ json: pageOf(rows, 0, 25, rows.length) }));
  await signIn(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await expect(page.getByRole("heading", { name: "FileGrid Dispecerat" })).toHaveCount(0);
  await expect(page.locator(".incident-card").nth(0).getByText("PENDING", { exact: true })).toBeVisible();
  await expect(page.locator(".incident-card").nth(1).getByText("FAILED", { exact: true })).toBeVisible();
  await expect(page.getByText("Fișierele disponibile", { exact: false })).toBeVisible();
  await expect(page.getByText("available-1.txt")).toBeVisible();
  await expect(page.getByText("available-2.txt")).toBeVisible();
  await expect(page.getByText("AVAILABLE", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Model 1 · Impact și urgență" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model 2 · Corelare incidente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evaluare cu prioritate ridicată" })).toBeVisible();
  await expect(page.getByText("rf-v3")).toBeVisible(); await expect(page.getByText("dbscan-v2")).toBeVisible();
  await expect(page.getByText("etichetă locală 7", { exact: false })).toBeVisible();
});

test("incident search and ML filter apply to the current page; pagination requests the next page", async ({ page }) => {
  const requests: URL[] = [];
  await page.route("**/api/v1/incidents?**", route => {
    const url = new URL(route.request().url()); requests.push(url);
    const pageNumber = Number(url.searchParams.get("page"));
    const rows = pageNumber === 0 ? Array.from({ length: 25 }, (_, i) => incident(i + 1, i === 0 ? "PENDING" : "COMPLETED")) : [incident(26, "FAILED")];
    return route.fulfill({ json: pageOf(rows, pageNumber, 25, 26) });
  });
  await signIn(page); await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await page.getByLabel("Caută incidente în pagina curentă").fill("ST-1");
  await expect(page.getByRole("heading", { name: /^ST-1 \/ / })).toBeVisible();
  await page.getByLabel("Filtru analiză ML").selectOption("PENDING");
  await expect(page.locator(".incident-card")).toHaveCount(1);
  await expect(page.getByText("ST-2", { exact: true })).toHaveCount(0);
  await page.getByLabel("Caută incidente în pagina curentă").fill("");
  await page.getByLabel("Filtru analiză ML").selectOption("");
  await page.getByRole("button", { name: "Incidente următoare" }).click();
  await expect.poll(() => requests.some(x => x.searchParams.get("page") === "1")).toBe(true);
  await expect(page.getByRole("heading", { name: /^ST-26 \/ / })).toBeVisible();
});

test("meter filter is encoded and pagination uses the API page query", async ({ page }) => {
  const requests: URL[] = [];
  await page.route("**/api/v1/meter-readings?**", route => {
    const url = new URL(route.request().url()); requests.push(url);
    const pageNumber = Number(url.searchParams.get("page"));
    return route.fulfill({ json: pageOf(pageNumber ? [{ readingId: "reading-26", meterId: "M/1", sequenceNumber: 26, energyKwh: 4, fileId: "file-1", measuredAt: "2026-11-14T10:00:00Z" }] : [], pageNumber, 25, 26) });
  });
  await signIn(page); await page.locator("nav button").filter({ hasText: "Citiri contoare" }).click();
  await page.getByLabel("ID contor").fill(" M/1 "); await page.getByRole("button", { name: "Filtrează citirile" }).click();
  await expect.poll(() => requests.some(x => x.searchParams.get("meterId") === "M/1")).toBe(true);
  await page.getByRole("button", { name: "Citiri următoare" }).click();
  await expect.poll(() => requests.some(x => x.searchParams.get("page") === "1" && x.searchParams.get("meterId") === "M/1")).toBe(true);
  await expect(page.getByText("reading-26")).toBeVisible();
});

test("operation permission error focuses the error summary", async ({ page }) => {
  await page.route("**/api/v1/incidents", route => route.request().method() === "POST"
    ? route.fulfill({ status: 403, json: { detail: "Denied", correlationId: "incident-denied" } })
    : route.fulfill({ json: emptyPage }));
  await signIn(page); await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("button", { name: "+ Creează incident" }).click();
  await expect(page.getByRole("alert")).toContainText("incident-denied");
  await expect(page.locator("[data-error-summary]")).toBeFocused();
});

test("upload progress exposes an accessible name and current phase", async ({ page }) => {
  const pending = gate();
  await page.route("**/api/v1/upload-sessions", route => route.fulfill({ status: 201, json: {
    sessionId: "session-1", fileId: "file-1", uploadMode: "SINGLE", partSizeBytes: 8388608,
    expiresAt: "2099-01-01T00:00:00Z", status: "CREATED", confirmedParts: [],
  } }));
  await page.route("**/api/v1/upload-sessions/session-1/content", async route => { pending.start(); await pending.promise; await route.fulfill({ json: {} }); });
  await signIn(page); await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("combobox", { name: "Categorie", exact: true }).selectOption("CONNECTION_DOCUMENT");
  await page.locator("input[type=file]").setInputFiles({ name: "report.txt", mimeType: "text/plain", buffer: bytes });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await pending.started;
  await expect(page.getByRole("progressbar", { name: "Progres încărcare" })).toHaveAttribute("aria-valuetext", "Se transferă fișierul…");
  pending.release();
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
});

test("verified stream download writes exact bytes and closes the destination", async ({ page }) => {
  await installWriter(page);
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Descărcare verificată");
  expect(await page.evaluate(() => (window as any).__downloadChunks)).toEqual([...bytes]);
  expect(await page.evaluate(() => (window as any).__writerEvents)).toEqual(["write", "close"]);
});

test("download rejects a mismatched checksum and aborts the destination writer", async ({ page }) => {
  await installWriter(page);
  const corrupt = Buffer.from(bytes); corrupt[0] ^= 0xff;
  await page.route("**/api/v1/files/file-1/content", route => route.fulfill({ status: 200,
    headers: { "X-Content-SHA256": file.sha256 }, body: corrupt }));
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("SHA-256 descărcat nu corespunde");
  expect(await page.evaluate(() => (window as any).__writerEvents)).toEqual(["write", "abort"]);
  await expect(page.getByRole("button", { name: "Anulează descărcarea" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("download rejects a mismatched server hash header before writing", async ({ page }) => {
  await installWriter(page);
  await page.route("**/api/v1/files/file-1/content", route => route.fulfill({ status: 200,
    headers: { "X-Content-SHA256": "0".repeat(64) }, body: bytes }));
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("SHA-256 din răspuns diferă");
  expect(await page.evaluate(() => (window as any).__writerEvents)).toEqual([]);
});

test("incomplete download aborts the stream writer and reports a length error", async ({ page }) => {
  await installWriter(page);
  await page.route("**/api/v1/files/file-1/content", route => route.fulfill({ status: 200,
    headers: { "X-Content-SHA256": file.sha256 }, body: bytes.subarray(0, bytes.length - 2) }));
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Descărcare incompletă");
  expect(await page.evaluate(() => (window as any).__writerEvents)).toContain("abort");
  expect(await page.evaluate(() => (window as any).__writerEvents)).not.toContain("close");
});

test("writer failure reports an error and never reports download success", async ({ page }) => {
  await installWriter(page, { failWrite: true });
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Writer rejected chunk");
  expect(await page.evaluate(() => (window as any).__writerEvents)).toContain("write");
  expect(await page.evaluate(() => (window as any).__writerEvents)).not.toContain("close");
  await expect(page.getByRole("button", { name: "Anulează descărcarea" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("canceling a download aborts an in-flight stream writer", async ({ page }) => {
  await installWriter(page, { holdWrite: true });
  await page.route("**/api/v1/files/file-1/content", route => route.fulfill({ status: 200,
    headers: { "X-Content-SHA256": file.sha256 }, body: bytes }));
  await signIn(page); await chooseFilesTab(page);
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__writerStarted)).toBe(true);
  await page.getByRole("button", { name: "Anulează descărcarea" }).click();
  await page.evaluate(() => (window as any).__releaseWriter());
  await expect(page.getByText("Descărcare anulată", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__writerEvents)).toContain("abort");
});


test("large download is disabled before any content request when streaming is unavailable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", {
    configurable: true, value: undefined,
  }));
  let contentRequests = 0;
  const large = { ...file, id: "large-file", filename: "large-video.mp4", category: "DRONE_VIDEO", sizeBytes: 129 * 1024 * 1024 };
  await page.route("**/api/v1/files?**", route => route.fulfill({ json: pageOf([large]) }));
  await page.route("**/api/v1/files/large-file/content", route => { contentRequests++; return route.fulfill({ status: 500 }); });
  await signIn(page); await chooseFilesTab(page);
  const download = page.getByRole("button", { name: "↓ Descarcă", exact: true });
  await expect(download).toBeDisabled();
  await expect(download).toHaveAccessibleDescription(/128 MiB.*Chrome\/Edge/);
  await expect(page.locator("#download-capability")).toContainText("până la 128 MiB");
  expect(contentRequests).toBe(0);
});

test("small positive measured rates remain readable and do not round to zero", async ({ page }) => {
  await page.route("**/api/v1/stats/technical", route => route.fulfill({ json: {
    windowMinutes: 60, series: [{ category: "INCIDENT", storage: "S3", operation: "download",
      operations: 1, bytesPerSecond: 60.3211111111, operationsPerSecond: 1 / 3600,
      p50Ms: 2, p95Ms: 2, p99Ms: 2, errorRate: 0 }],
  } }));
  await signIn(page);
  await expect(page.getByRole("cell", { name: "60.32 B/s", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "0.000278", exact: true })).toBeVisible();
});

test("storm priority keeps safety reports and immediate human review ahead of numerical scores", async ({ page }) => {
  const analysis = { priorityScore: 99, priorityClass: "CRITICAL", clusterId: 0, clusterSize: 2,
    recommendation: "HIGH_PRIORITY_REVIEW", reasons: [], synthetic: true, modelVersions: {} };
  const ordinary = { ...incident(1, "COMPLETED", analysis), stationId: "HIGH-SCORE" };
  const immediate = { ...incident(2, "COMPLETED", { ...analysis, priorityScore: 25, recommendation: "IMMEDIATE_HUMAN_REVIEW" }), stationId: "IMMEDIATE" };
  const reported = { ...incident(3, "PENDING"), severity: 1, safetyCritical: true, stationId: "SAFETY-REPORT" };
  await page.route("**/api/v1/incidents?**", route => route.fulfill({ json: pageOf([ordinary, immediate, reported]) }));
  await page.route("**/api/v1/stats/business", route => route.fulfill({ json: { files: 3, readings: 0, incidents: 30, recentIncidents: 30, mode: "STORM", zones: [] } }));
  await signIn(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  const cards = page.locator(".incident-card");
  await expect(cards.nth(0)).toContainText("IMMEDIATE");
  await expect(cards.nth(1)).toContainText("SAFETY-REPORT");
  await expect(cards.nth(1)).toContainText("CRITIC DE SIGURANȚĂ");
  await expect(cards.nth(2)).toContainText("HIGH-SCORE");
});
