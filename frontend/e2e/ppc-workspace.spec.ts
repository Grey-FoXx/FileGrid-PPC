import { test, expect, Page, Route } from "@playwright/test";

const auth = "Basic " + Buffer.from("admin:fixture").toString("base64");
const pageOf = <T,>(items: T[], page = 0, size = 25, total = items.length) => ({ items, page, size, total });
const file = {
  id: "file-metric", category: "INCIDENT", filename: "route-log.txt", contentType: "text/plain",
  sizeBytes: 12, sha256: "a".repeat(64), status: "AVAILABLE", integrityStatus: "VERIFIED",
  storage: "FTP", owner: "admin", policyVersion: "4", routingReason: "legacy fixture", createdAt: "2026-11-14T09:00:00Z",
};
const policies = {
  version: 4,
  rules: [
    { id: "incident-binary", category: "INCIDENT", storage: "S3", attachmentType: "BINARY", sensitivity: "SENSITIVE" },
    { id: "incident-legacy", category: "INCIDENT", storage: "FTP", attachmentType: "LEGACY_LOG", sensitivity: "NON_SENSITIVE" },
    { id: "meters-db", category: "METER_READING", storage: "DATABASE" },
  ],
};

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
}
function apiFixtures(page: Page, options: {
  incidents?: unknown[];
  technical?: unknown;
  onIncidentPost?: (route: Route) => Promise<void>;
  onPolicyWrite?: () => void;
}) {
  return page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/me")) return route.fulfill({ json: { username: "admin", role: "ADMIN" } });
    if (path.endsWith("/incidents") && request.method() === "POST") {
      if (options.onIncidentPost) return options.onIncidentPost(route);
      return route.fulfill({ status: 201, json: {} });
    }
    if (path.endsWith("/policies") && !["GET", "HEAD"].includes(request.method())) {
      options.onPolicyWrite?.();
      return route.fulfill({ status: 405, json: { detail: "Read only fixture" } });
    }
    if (path.endsWith("/files") && request.method() === "GET") return route.fulfill({ json: pageOf([file]) });
    if (path.endsWith("/incidents") && request.method() === "GET")
      return route.fulfill({ json: pageOf(options.incidents || [], Number(url.searchParams.get("page") || 0), 25, (options.incidents || []).length) });
    if (path.endsWith("/meter-readings")) return route.fulfill({ json: pageOf([]) });
    if (path.endsWith("/stats/business")) return route.fulfill({ json: { files: 1, readings: 0, incidents: (options.incidents || []).length, mode: "NORMAL", recentIncidents: 0, zones: [] } });
    if (path.endsWith("/stats/technical")) return route.fulfill({ json: options.technical || { windowMinutes: 60, series: [] } });
    if (path.endsWith("/policies")) return route.fulfill({ json: policies });
    return route.fulfill({ json: {} });
  });
}

test("combined report creates metadata without a file and maps the returned coordinates", async ({ page }) => {
  let sessions = 0;
  let createBody: Record<string, unknown> | undefined;
  const incident = {
    id: "incident-coordinate", stationId: "DB-TEST-21", zone: "Dobrogea", eventType: "VOLTAGE_DROP",
    severity: 4, affectedCustomers: 38, latitude: 44.4, longitude: 26.1,
    occurredAt: "2026-11-14T10:00:00Z", mlStatus: "NOT_REQUESTED", analysis: null, attachments: [],
  };
  const currentIncidents: unknown[] = [];
  await apiFixtures(page, {
    incidents: currentIncidents,
    onIncidentPost: async route => {
      createBody = route.request().postDataJSON() as Record<string, unknown>;
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      currentIncidents.push(incident);
      await route.fulfill({ status: 201, json: incident });
    },
  });
  await page.route("**/api/v1/upload-sessions**", async route => { sessions++; await route.fulfill({ status: 500, json: {} }); });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByLabel("Stație").fill("DB-TEST-21");
  await page.getByLabel("Zonă").fill("Dobrogea");
  await page.getByLabel("Tip eveniment").fill("VOLTAGE_DROP");
  await page.getByLabel("Severitate (1–5)").fill("4");
  await page.getByLabel("Clienți afectați").fill("38");
  await page.getByLabel("Latitudine").fill("44.4");
  await page.getByLabel("Longitudine").fill("26.1");
  await page.getByRole("button", { name: "Raportează avaria", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Incident creat");
  expect(createBody).toMatchObject({ stationId: "DB-TEST-21", zone: "Dobrogea", severity: 4, latitude: 44.4, longitude: 26.1 });
  expect(sessions).toBe(0);

  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  const marker = page.getByRole("button", { name: /1 rapoarte, severitate 4, Dobrogea/ });
  await expect(marker).toBeVisible();
  const coordinates = (await marker.getAttribute("transform"))?.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  expect(coordinates).not.toBeNull();
  expect(Number(coordinates![1])).toBeCloseTo(427, 4);
  expect(Number(coordinates![2])).toBeCloseTo(420, 4);
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("DB-TEST-21", { exact: true })).toBeVisible();
  await expect(page.locator(".map-info")).toContainText("0 rapoarte fără coordonate valide");
  expect(sessions).toBe(0);
});

test("map clusters by event, time and distance rather than local ML labels; file metrics stay measured", async ({ page }) => {
  const analysis = { priorityScore: 70, priorityClass: "HIGH", clusterId: 12, clusterSize: 2,
    recommendation: "HIGH_PRIORITY_REVIEW", reasons: ["fixture"], synthetic: false };
  const incidents = [
    { id: "near-1", stationId: "BT-NEAR-1", zone: "Banat", eventType: "VOLTAGE_DROP", severity: 3,
      affectedCustomers: 20, latitude: 45.75, longitude: 21.23, occurredAt: "2026-11-14T10:00:00Z", mlStatus: "COMPLETED", analysis, attachments: [] },
    { id: "near-2", stationId: "BT-NEAR-2", zone: "Banat", eventType: "VOLTAGE_DROP", severity: 4,
      affectedCustomers: 40, latitude: 45.76, longitude: 21.24, occurredAt: "2026-11-14T10:20:00Z", mlStatus: "COMPLETED", analysis, attachments: [] },
    { id: "far-same-label", stationId: "DB-FAR", zone: "Dobrogea", eventType: "VOLTAGE_DROP", severity: 2,
      affectedCustomers: 10, latitude: 44.18, longitude: 28.65, occurredAt: "2026-11-14T10:10:00Z", mlStatus: "COMPLETED", analysis, attachments: [] },
  ];
  const technical = { windowMinutes: 60, series: [{ category: "INCIDENT", storage: "FTP", operation: "upload",
    operations: 1, bytesPerSecond: 0, operationsPerSecond: 0, p50Ms: 0, p95Ms: 12.5, p99Ms: 0, errorRate: 0 }] };
  await apiFixtures(page, { incidents, technical });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  const cluster = page.getByRole("button", { name: /2 rapoarte, severitate 4/ });
  const far = page.getByRole("button", { name: /1 rapoarte, severitate 2, Dobrogea/ });
  await expect(cluster).toBeVisible();
  await expect(far).toBeVisible();
  await cluster.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("BT-NEAR-1", { exact: true })).toBeVisible();
  await expect(page.getByText("BT-NEAR-2", { exact: true })).toBeVisible();
  await expect(page.getByText("Grupul vizual nu înlocuiește Modelul 2", { exact: false })).toBeVisible();
  const mapDetails = page.locator(".map-info");
  await expect(mapDetails).not.toContainText("DB-FAR");

  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  const metrics = page.getByRole("region", { name: "Metrici fișiere pe categorie și storage" });
  const ftpRow = metrics.getByRole("row", { name: /Avarii upload FTP/ });
  await expect(ftpRow).toContainText("0 ms");
  await expect(ftpRow).toContainText("12.5 ms");
  await expect(ftpRow).toContainText("0 B/s");
  await expect(ftpRow).toContainText("0 op/s");
  await expect(ftpRow).toContainText("0%");
  await expect(metrics.getByRole("row", { name: /Avarii S3/ })).toContainText("Not measured");
  const journey = page.getByRole("region", { name: "Traseul unei operații" });
  await journey.getByLabel("Categorie traseu").selectOption("INCIDENT");
  await expect(journey.getByLabel("Categorie traseu")).toHaveValue("INCIDENT");
  await expect(journey).toContainText("route-log.txt");
});

test("admin policy dialog keeps keyboard and FTP guards and restores policy through the live API", async ({ page }) => {
  let active = structuredClone(policies);
  const initial = structuredClone(policies);
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let downloads = 0;
  page.on("download", () => downloads++);
  await apiFixtures(page, {});
  await page.route("**/api/v1/policies**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: active });
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ method: request.method(), path, body });
    if (path.endsWith("/reset")) {
      active = { ...structuredClone(initial), version: Number(active.version) + 1 };
    } else {
      const rules = body["rules"] as typeof policies.rules;
      active = { version: Number(active.version) + 1, rules };
    }
    return route.fulfill({ json: active });
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Politici de stocare" }).click();
  const open = page.locator(".category-card").filter({ hasText: "Avarii" }).getByRole("button", { name: "O nouă politică" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "O nouă politică" });
  await expect(dialog).toBeVisible();
  const category = dialog.getByLabel("Regulă de configurat");
  await expect(category).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await expect(dialog.getByLabel("Destinație")).toHaveValue("S3");
  await expect(dialog.getByLabel("Tip atașament")).toHaveValue("BINARY");
  await dialog.getByLabel("Destinație").selectOption("FTP");
  const confirm = dialog.getByRole("button", { name: "Aplică politica" });
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("FTP este permis numai");
  expect(writes).toHaveLength(0);

  await dialog.getByLabel("Tip atașament").selectOption("LEGACY_LOG");
  await dialog.getByLabel("Sensibilitate").selectOption("NON_SENSITIVE");
  await confirm.click();
  await expect(dialog.getByRole("status")).toContainText("este activă");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "PUT", path: "/api/v1/policies", body: { expectedVersion: 4 } });
  expect((writes[0].body["rules"] as typeof policies.rules).find(rule => rule.id === "incident-binary"))
    .toMatchObject({ storage: "FTP", attachmentType: "LEGACY_LOG", sensitivity: "NON_SENSITIVE" });
  await expect(page.locator(".page-heading")).toContainText("POLICY v5");

  await dialog.getByRole("button", { name: "Revino la politica inițială" }).click();
  await expect(dialog.getByRole("status")).toContainText("este activă");
  expect(writes[1]).toMatchObject({ method: "POST", path: "/api/v1/policies/reset", body: { expectedVersion: 5 } });
  expect(active.rules).toEqual(initial.rules);
  expect(downloads).toBe(0);
  await expect(dialog).not.toContainText("docker compose");
});
