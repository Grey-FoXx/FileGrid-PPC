import { test, expect, Page, Route } from "@playwright/test";

const auth = "Basic " + Buffer.from("admin:fixture").toString("base64");
const pageOf = <T,>(items: T[], page = 0, size = 25, total = items.length) => ({ items, page, size, total });
const makeFile = (id: string, filename: string, category: string, storage = "S3") => ({
  id, category, filename, contentType: "text/plain", sizeBytes: 12, sha256: "a".repeat(64),
  status: "AVAILABLE", integrityStatus: "VERIFIED", storage, owner: "admin", policyVersion: "1",
  routingReason: "fixture", createdAt: "2026-11-14T10:00:00Z",
});
const demoFile = makeFile("demo-file", "bounded-demo.txt", "INCIDENT");
const ordinaryFile = makeFile("ordinary-file", "ordinary-note.txt", "INCIDENT");
const initialIncident = (id: string, stationId: string, lat: number, lon: number) => ({
  id, groupId: "group-01", interventionStatus: "NEW", stationId, zone: "Banat",
  eventType: "VOLTAGE_DROP", severity: 3, affectedCustomers: 20, latitude: lat, longitude: lon,
  occurredAt: "2026-11-14T10:00:00Z", createdAt: "2026-11-14T10:00:00Z", mlStatus: "COMPLETED",
  analysis: { priorityScore: 70, priorityClass: "HIGH", clusterId: 12, clusterSize: 2,
    recommendation: "HIGH_PRIORITY_REVIEW", reasons: ["fixture"], modelVersions: { correlation: "dbscan-v1" }, synthetic: true },
  attachments: [],
});

interface SeenCall { method: string; path: string; search: URLSearchParams; demo: string | undefined; body?: any; }
interface FixtureOptions {
  roleFeatures?: { demo?: boolean; incidentGroups?: boolean };
  files?: (url: URL, scoped: boolean) => unknown[];
  incidents?: () => unknown[];
  groups?: () => unknown[];
  business?: (scoped: boolean) => unknown;
  demo?: () => unknown;
  onPostIncident?: (route: Route) => Promise<void>;
  onDemoInitialize?: () => unknown;
  onDemoMode?: (mode: string) => unknown;
  onDemoReset?: () => unknown;
  onGroupTransition?: (id: string, status: string) => unknown;
  onOtherWrite?: () => void;
}

function installApi(page: Page, options: FixtureOptions = {}) {
  const calls: SeenCall[] = [];
  page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const demo = request.headers()["x-filegrid-demo"];
    const scoped = demo === "true";
    let body: any;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    calls.push({ method: request.method(), path, search: url.searchParams, demo, body });

    if (path === "/me") return route.fulfill({ json: { username: "admin", role: "ADMIN", features: options.roleFeatures || { demo: false, incidentGroups: true } } });
    if (path === "/demo" && request.method() === "GET") return route.fulfill({ json: options.demo?.() || { enabled: false, initialized: true, mode: "NORMAL", generating: false, seedVersion: "fixture-v1" } });
    if (path === "/demo/initialize" && request.method() === "POST") return route.fulfill({ status: 200, json: options.onDemoInitialize?.() || {} });
    if (path === "/demo/mode" && request.method() === "POST") return route.fulfill({ status: 200, json: options.onDemoMode?.(body?.mode) || {} });
    if (path === "/demo/reset" && request.method() === "POST") return route.fulfill({ status: 200, json: options.onDemoReset?.() || {} });
    if (path === "/incident-groups" && request.method() === "GET") return route.fulfill({ json: { items: options.groups?.() || [], total: (options.groups?.() || []).length } });
    if (path.startsWith("/incident-groups/") && path.endsWith("/status") && request.method() === "PATCH") {
      const id = path.split("/")[2];
      return route.fulfill({ json: options.onGroupTransition?.(id, body?.status) || { id, status: body?.status } });
    }
    if (path === "/incidents" && request.method() === "POST") {
      if (options.onPostIncident) return options.onPostIncident(route);
      return route.fulfill({ status: 201, json: {} });
    }
    if (path === "/incidents" && request.method() === "GET") return route.fulfill({ json: pageOf(options.incidents?.() || [], Number(url.searchParams.get("page") || 0), 25, (options.incidents?.() || []).length) });
    if (path === "/files" && request.method() === "GET") return route.fulfill({ json: pageOf(options.files?.(url, scoped) || [], Number(url.searchParams.get("page") || 0), 25, (options.files?.(url, scoped) || []).length) });
    if (path === "/stats/business") return route.fulfill({ json: options.business?.(scoped) || { files: 0, readings: 0, incidents: 0, mode: "NORMAL", recentIncidents: 0, zones: [] } });
    if (path === "/stats/technical") return route.fulfill({ json: { windowMinutes: 60, series: [] } });
    if (path === "/meter-readings") return route.fulfill({ json: pageOf([]) });
    if (path === "/policies") return route.fulfill({ json: { version: 1, rules: [] } });
    if (path.startsWith("/files/") && request.method() !== "GET") options.onOtherWrite?.();
    return route.fulfill({ json: {} });
  });
  return calls;
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
}

test("demo initializes a bounded real API dataset, changes mode, resets only demo and drops scope on toggle", async ({ page }) => {
  let initialized = false;
  let mode: "NORMAL" | "STORM" = "NORMAL";
  let demoItems = [demoFile];
  let demoGroups: unknown[] = [];
  let initializationCalls = 0, resetCalls = 0, ordinaryWrites = 0;
  const demoStatus = () => ({ enabled: true, initialized, mode, generating: mode === "STORM", seedVersion: "fixture-v1" });
  const boundedStats = (scoped: boolean) => scoped
    ? { files: demoItems.length, readings: 2, incidents: mode === "STORM" ? 12 : 6, mode, recentIncidents: mode === "STORM" ? 12 : 2, zones: [{ zone: "Banat", incidents: mode === "STORM" ? 8 : 3 }] }
    : { files: 1, readings: 1, incidents: 1, mode: "NORMAL", recentIncidents: 0, zones: [] };
  const calls = installApi(page, {
    roleFeatures: { demo: true, incidentGroups: true },
    demo: demoStatus,
    onDemoInitialize: () => { initializationCalls++; initialized = true; return demoStatus(); },
    onDemoMode: requested => { mode = requested === "STORM" ? "STORM" : "NORMAL"; demoGroups = mode === "STORM" ? [{ id: "demo-group", status: "NEW", zone: "Banat", eventType: "VOLTAGE_DROP", severity: 4, incidents: [] }] : []; return demoStatus(); },
    onDemoReset: () => { resetCalls++; mode = "NORMAL"; demoItems = [demoFile]; demoGroups = []; return demoStatus(); },
    groups: () => demoGroups,
    files: (_url, scoped) => scoped ? demoItems : [ordinaryFile],
    business: boundedStats,
    onOtherWrite: () => ordinaryWrites++,
  });
  await login(page);
  await expect(page.getByRole("button", { name: "Storm", exact: true })).toBeVisible();
  expect(initializationCalls).toBe(1);
  await expect(page.locator(".stat").filter({ hasText: "Incidente raportate" }).locator("strong")).toHaveText("6");
  expect(calls.find(call => call.path === "/demo" && call.method === "GET")?.demo).toBeUndefined();
  expect(calls.find(call => call.path === "/demo/initialize")?.demo).toBeUndefined();
  expect(calls.some(call => call.path === "/stats/business" && call.demo === "true")).toBe(true);

  await page.getByRole("button", { name: "Storm", exact: true }).click();
  await expect(page.locator(".stat.mode strong")).toHaveText("STORM");
  expect(calls.some(call => call.path === "/demo/mode" && call.method === "POST" && call.demo === "true" && call.body.mode === "STORM")).toBe(true);
  expect(calls.some(call => call.path === "/incident-groups" && call.method === "GET" && call.demo === "true")).toBe(true);

  await page.getByRole("button", { name: /Reset demo/ }).click();
  await expect(page.getByText(/Demo resetat\. Datele existente din afara demo-ului au fost păstrate/)).toBeVisible();
  expect(resetCalls).toBe(1);
  expect(calls.some(call => call.path === "/demo/reset" && call.method === "POST" && call.demo === "true")).toBe(true);
  expect(calls.some(call => call.method === "DELETE" || (["POST", "PUT", "PATCH"].includes(call.method) && (call.path.startsWith("/files") || call.path.startsWith("/incidents"))))).toBe(false);
  expect(ordinaryWrites).toBe(0);

  await page.getByRole("button", { name: /Demo · vezi toate datele/ }).click();
  await expect(page.getByRole("button", { name: /Toate datele · deschide demo/ })).toBeVisible();
  expect(calls.some(call => call.path === "/stats/business" && call.demo === undefined)).toBe(true);
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await expect(page.getByText("ordinary-note.txt", { exact: true })).toBeVisible();
  expect(calls.some(call => call.path === "/files" && call.demo === undefined)).toBe(true);
});

test("new nearby report joins persistent group and group actions persist through reload", async ({ page }) => {
  const first = initialIncident("incident-a", "BT-NEAR-1", 45.75, 21.23);
  const second = initialIncident("incident-b", "BT-NEAR-2", 45.76, 21.24);
  const group: any = { id: "group-01", status: "NEW", zone: "Banat", eventType: "VOLTAGE_DROP", severity: 3, incidents: [first, second] };
  const patchHistory: string[] = [];
  const calls = installApi(page, {
    roleFeatures: { demo: false, incidentGroups: true },
    incidents: () => group.incidents.map((item: any) => ({ ...item, interventionStatus: group.status })),
    groups: () => group.status === "RESOLVED" ? [] : [group],
    onPostIncident: async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      expect(body).toMatchObject({ zone: "Banat", eventType: "VOLTAGE_DROP", latitude: 45.755, longitude: 21.235 });
      const added = { ...initialIncident("incident-c", String(body.stationId), Number(body.latitude), Number(body.longitude)),
        id: "incident-c", zone: String(body.zone), eventType: String(body.eventType), severity: Number(body.severity),
        affectedCustomers: Number(body.affectedCustomers), occurredAt: "2026-11-14T10:20:00Z", groupId: group.id, interventionStatus: group.status };
      group.incidents.push(added);
      await route.fulfill({ status: 201, json: added });
    },
    onGroupTransition: (id, status) => {
      expect(id).toBe(group.id);
      patchHistory.push(status);
      group.status = status;
      group.incidents = group.incidents.map((item: any) => ({ ...item, interventionStatus: status }));
      return { id, status };
    },
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  const marker = page.getByRole("button", { name: /2 rapoarte, severitate 3, Banat/ });
  await expect(marker).toBeVisible();
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-info")).toContainText("BT-NEAR-1");
  await expect(page.locator(".map-info")).toContainText("BT-NEAR-2");
  const groupCard = page.locator(".group-card").filter({ hasText: "group-01" });
  await expect(groupCard).toContainText("2 rapoarte");

  await page.getByRole("button", { name: /Raportează avarie/ }).first().click();
  await page.getByLabel("Stație").fill("BT-NEAR-3");
  await page.getByLabel("Zonă").fill("Banat");
  await page.getByLabel("Tip eveniment").fill("VOLTAGE_DROP");
  await page.getByLabel("Severitate (1–5)").fill("3");
  await page.getByLabel("Clienți afectați").fill("31");
  await page.getByLabel("Latitudine").fill("45.755");
  await page.getByLabel("Longitudine").fill("21.235");
  await page.getByRole("button", { name: "Raportează avaria", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Incident creat");
  expect(group.incidents).toHaveLength(3);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await expect(page.locator(".group-card").filter({ hasText: "group-01" })).toContainText("3 rapoarte");
  await expect(page.getByRole("button", { name: /3 rapoarte, severitate 3, Banat/ })).toBeVisible();

  const card = page.locator(".group-card").filter({ hasText: "group-01" });
  await card.getByRole("button", { name: /Trimite echipaj pentru grup/ }).click();
  await expect(card).toContainText("Echipaj trimis");
  await card.getByRole("button", { name: /Marchează întregul grup rezolvat/ }).click();
  await expect(page.locator(".group-card")).toHaveCount(0);
  await expect(page.locator(".map-marker")).toHaveCount(0);
  expect(patchHistory).toEqual(["DISPATCHED", "RESOLVED"]);

  await page.reload();
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await expect(page.locator(".group-card")).toHaveCount(0);
  await expect(page.locator(".map-marker")).toHaveCount(0);
  expect(group.status).toBe("RESOLVED");
  expect(calls.filter(call => call.path === "/incident-groups" && call.method === "GET").length).toBeGreaterThanOrEqual(3);
  expect(calls.filter(call => call.method === "PATCH" && call.path.startsWith("/incident-groups/")).map(call => call.body.status)).toEqual(["DISPATCHED", "RESOLVED"]);
});

test("file journey fetches selected category independently of the catalog and retains actual SVG connectors", async ({ page }) => {
  const catalogFile = makeFile("catalog-incident", "catalog-incident.txt", "INCIDENT", "FTP");
  const droneFile = makeFile("drone-journey", "drone-video.mp4", "DRONE_VIDEO", "S3");
  const calls = installApi(page, {
    roleFeatures: { demo: false, incidentGroups: true },
    files: url => {
      const category = url.searchParams.get("category");
      return category === "DRONE_VIDEO" ? [droneFile] : category === "METER_READING" ? [] : [catalogFile];
    },
  });
  await login(page);
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await expect(page.getByText("catalog-incident.txt", { exact: true })).toBeVisible();
  const journey = page.getByRole("region", { name: "Traseul unei operații" });
  await journey.getByLabel("Categorie traseu").selectOption("DRONE_VIDEO");
  await expect(journey).toContainText("drone-video.mp4");
  await expect(journey).toContainText("Transfer multipart");
  await expect(journey.locator("svg.journey-connectors path")).toHaveAttribute("d", "M70 56 L210 111 L350 56 L490 111 L630 56 L770 111 L910 56");
  expect(calls.some(call => call.path === "/files" && call.method === "GET" && call.search.get("category") === "DRONE_VIDEO" && call.search.get("page") === "0" && call.search.get("size") === "25")).toBe(true);
  expect(calls.some(call => call.path === "/files" && call.method === "GET" && call.search.get("category") === "")).toBe(true);
});
