import { test, expect, Page } from "@playwright/test";

const pageOf = <T,>(items: T[]) => ({ items, page: 0, size: 25, total: items.length });
const initialPolicy = {
  version: 4,
  rules: [
    { id: "incident-binary", category: "INCIDENT", storage: "S3", attachmentType: "BINARY", sensitivity: "SENSITIVE" },
    { id: "incident-legacy", category: "INCIDENT", storage: "FTP", attachmentType: "LEGACY_LOG", sensitivity: "NON_SENSITIVE" },
  ],
};
const fileFromOldPolicy = {
  id: "old-file", category: "INCIDENT", filename: "old-route-log.txt", contentType: "text/plain",
  sizeBytes: 12, sha256: "a".repeat(64), status: "AVAILABLE", integrityStatus: "VERIFIED",
  storage: "S3", owner: "admin", policyVersion: "4", routingReason: "incident-binary matched", createdAt: "2026-11-14T09:00:00Z",
};

async function login(page: Page, role = "ADMIN") {
  await page.goto("/");
  await page.getByLabel("Utilizator").fill(role.toLowerCase());
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
}

function incident(groupId: string, index: number, coordinates: { latitude: number; longitude: number }, occurredAt = "2026-11-14T10:00:00Z") {
  return {
    id: `${groupId}-member-${index}`, groupId, interventionStatus: "NEW", stationId: `BT-${groupId}-${index}`,
    zone: "Banat", eventType: "VOLTAGE_DROP", severity: index % 2 ? 3 : 4, affectedCustomers: 5 + index,
    ...coordinates, occurredAt, mlStatus: "PENDING", analysis: null, attachments: [],
  };
}
function group(id: string, count: number, coordinates: { latitude: number; longitude: number }) {
  return { id, status: "NEW", zone: "Banat", eventType: "VOLTAGE_DROP", severity: 4,
    latitude: coordinates.latitude, longitude: coordinates.longitude,
    incidents: Array.from({ length: count }, (_, index) => incident(id, index + 1, coordinates)) };
}

function installBaseApi(page: Page, options: {
  role?: string;
  groups?: () => unknown[];
  onIncident?: (body: Record<string, unknown>) => unknown;
  onPolicy?: (method: string, path: string, body: Record<string, unknown>) => { status?: number; json: unknown } | undefined;
  currentPolicy?: () => unknown;
}) {
  return page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/me")) return route.fulfill({ json: {
      username: (options.role || "ADMIN").toLowerCase(), role: options.role || "ADMIN",
      features: { incidentGroups: true },
    } });
    if (path.endsWith("/policies")) {
      if (request.method() === "GET") return route.fulfill({ json: options.currentPolicy?.() || initialPolicy });
      const result = options.onPolicy?.(request.method(), path, request.postDataJSON() as Record<string, unknown>);
      if (result) return route.fulfill({ status: result.status || 200, json: result.json });
      return route.fulfill({ status: 405, json: { detail: "Unexpected policy write" } });
    }
    if (path.endsWith("/policies/reset")) return route.fulfill({ status: 405, json: {} });
    if (path.endsWith("/incident-groups")) {
      const items = options.groups?.() || [];
      return route.fulfill({ json: { items, total: items.length } });
    }
    if (path.endsWith("/incidents") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: options.onIncident?.(body) || {
        id: "created-incident", stationId: body["stationId"], zone: body["zone"], eventType: body["eventType"],
        severity: body["severity"], affectedCustomers: body["affectedCustomers"], latitude: body["latitude"],
        longitude: body["longitude"], occurredAt: "2026-11-14T10:20:00Z", mlStatus: "PENDING", attachments: [], analysis: null,
      } });
    }
    if (path.endsWith("/incidents")) return route.fulfill({ json: pageOf([]) });
    if (path.endsWith("/files")) return route.fulfill({ json: pageOf([fileFromOldPolicy]) });
    if (path.endsWith("/meter-readings")) return route.fulfill({ json: pageOf([]) });
    if (path.endsWith("/stats/business")) return route.fulfill({ json: { files: 1, readings: 0, incidents: 0, mode: "NORMAL", recentIncidents: 0, zones: [] } });
    if (path.endsWith("/stats/technical")) return route.fulfill({ json: { windowMinutes: 60, series: [] } });
    return route.fulfill({ json: {} });
  });
}

test("admin live policy save updates active config without download while old files retain their routing version", async ({ page }) => {
  let active: typeof initialPolicy = structuredClone(initialPolicy);
  let savedBody: Record<string, unknown> | undefined;
  let downloadCount = 0;
  page.on("download", () => downloadCount++);
  installBaseApi(page, {
    currentPolicy: () => active,
    onPolicy: (method, path, body) => {
      expect(method).toBe("PUT");
      expect(path).toBe("/api/v1/policies");
      savedBody = body;
      active = { version: 5, rules: body["rules"] as typeof initialPolicy.rules };
      return { json: active };
    },
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Politici de stocare" }).click();
  const card = page.locator(".category-card").filter({ hasText: "Avarii" });
  await card.getByRole("button", { name: "Configurează politica" }).click();
  const dialog = page.getByRole("dialog", { name: "Configurează politica" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Regulă de configurat")).toBeFocused();
  await dialog.getByLabel("ID regulă").fill("incident-binary-v2");
  await dialog.getByLabel("Destinație").selectOption("S3");
  await dialog.getByRole("button", { name: "Aplică politica" }).click();
  await expect(dialog.getByRole("status")).toContainText("Politica v5 este activă");
  expect(savedBody).toMatchObject({ expectedVersion: 4 });
  expect(savedBody?.["rules"]).toEqual([
    { id: "incident-binary-v2", category: "INCIDENT", storage: "S3", attachmentType: "BINARY", sensitivity: "SENSITIVE" },
    initialPolicy.rules[1],
  ]);
  await expect(page.locator(".page-heading")).toContainText("POLICY v5");
  expect(downloadCount).toBe(0);
  await expect(dialog).not.toContainText("docker compose");
  await dialog.getByRole("button", { name: "Închide", exact: true }).click();

  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  const row = page.getByRole("region", { name: "Tabel de date" }).getByRole("row", { name: /old-route-log/ });
  await row.getByRole("button", { name: "Detalii" }).click();
  await expect(page.locator("section.details")).toContainText("v4");
  await expect(page.locator("section.details")).toContainText("incident-binary matched");
  expect(downloadCount).toBe(0);
});

test("stale policy conflict keeps the user's draft until active policy is explicitly reloaded", async ({ page }) => {
  let active = structuredClone(initialPolicy);
  let putCount = 0;
  installBaseApi(page, {
    currentPolicy: () => active,
    onPolicy: method => {
      if (method === "PUT") { putCount++; return { status: 409, json: { detail: "Policy version conflict" } }; }
      return undefined;
    },
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Politici de stocare" }).click();
  await page.locator(".category-card").filter({ hasText: "Avarii" }).getByRole("button", { name: "Configurează politica" }).click();
  const dialog = page.getByRole("dialog", { name: "Configurează politica" });
  const draftId = dialog.getByLabel("ID regulă");
  await draftId.fill("my-pending-rule");
  await dialog.getByRole("button", { name: "Aplică politica" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(draftId).toHaveValue("my-pending-rule");
  expect(putCount).toBe(1);

  active = { version: 5, rules: [
    { id: "external-update", category: "INCIDENT", storage: "S3", attachmentType: "BINARY", sensitivity: "SENSITIVE" },
    initialPolicy.rules[1],
  ] };
  await dialog.getByRole("button", { name: "Reîncarcă politica activă" }).click();
  await expect(page.locator(".page-heading")).toContainText("POLICY v5");
  await expect(dialog.getByLabel("Regulă de configurat")).toHaveValue("external-update");
  await expect(draftId).toHaveValue("external-update");
});

test("non-admin can read policies but cannot open live editing controls", async ({ page }) => {
  let writes = 0;
  installBaseApi(page, { role: "DISPATCHER", onPolicy: () => { writes++; return { status: 200, json: initialPolicy }; } });
  await login(page, "DISPATCHER");
  await page.locator("nav button").filter({ hasText: "Politici de stocare" }).click();
  await expect(page.getByText("Vizualizare disponibilă. Numai administratorii pot salva modificările politicilor.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurează politica" })).toHaveCount(0);
  expect(writes).toBe(0);
});

test("coincident backend groups stay separate, show full counts, and remain keyboard selectable", async ({ page }) => {
  const coordinates = { latitude: 45.75, longitude: 21.23 };
  const groups = [group("group-seven", 7, coordinates), group("group-two", 2, coordinates)];
  installBaseApi(page, { groups: () => groups });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();

  const first = page.locator('.map-marker[data-group-id="group-seven"]');
  const second = page.locator('.map-marker[data-group-id="group-two"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toHaveAttribute("aria-label", /7 rapoarte/);
  await expect(second).toHaveAttribute("aria-label", /2 rapoarte/);
  expect(Number(await first.getAttribute("data-source-x"))).toBeCloseTo(Number(await second.getAttribute("data-source-x")), 8);
  expect(Number(await first.getAttribute("data-source-y"))).toBeCloseTo(Number(await second.getAttribute("data-source-y")), 8);
  expect(await first.getAttribute("transform")).not.toBe(await second.getAttribute("transform"));

  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-info")).toContainText("BT-group-seven-1");
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-info")).toContainText("BT-group-two-1");
  await expect(page.locator(".map-info")).not.toContainText("BT-group-seven-1");
});

test("dense incident zones keep every visual marker inside Romania and near its real coordinate", async ({ page }) => {
  const coordinates = { latitude: 45.75, longitude: 21.23 };
  const groups = Array.from({ length: 77 }, (_, index) => group(`dense-${index + 1}`, 1, coordinates));
  installBaseApi(page, { groups: () => groups });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();

  const markers = page.locator(".map-marker");
  await expect.poll(() => markers.count()).toBeGreaterThan(0);
  expect(await markers.count()).toBeLessThanOrEqual(8);
  expect(await markers.evaluateAll(elements => elements.reduce((sum, element) => sum + Number(element.getAttribute('data-group-count')), 0))).toBe(77);
  const layout = await markers.evaluateAll(elements => {
    const outline = document.querySelector("#romania-clip path") as SVGGeometryElement;
    return elements.map(element => {
      const transform = element.getAttribute("transform") || "";
      const match = transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      const x = Number(match?.[1]), y = Number(match?.[2]);
      const sourceX = Number(element.getAttribute("data-source-x"));
      const sourceY = Number(element.getAttribute("data-source-y"));
      return { inside: outline.isPointInFill(new DOMPoint(x, y)), distance: Math.hypot(x - sourceX, y - sourceY) };
    });
  });
  expect(layout.every(marker => marker.inside)).toBe(true);
  expect(Math.max(...layout.map(marker => marker.distance))).toBeLessThanOrEqual(140);
});

test("new report arrival animates only into its backend group and updates that marker count", async ({ page }) => {
  const coordinates = { latitude: 45.75, longitude: 21.23 };
  const groups: any[] = [group("group-seven", 7, coordinates), group("group-two", 2, coordinates)];
  installBaseApi(page, {
    groups: () => groups,
    onIncident: body => {
      const member = { ...incident("group-seven", 8, coordinates, "2026-11-14T10:20:00Z"),
        id: "new-member", stationId: String(body["stationId"]), severity: Number(body["severity"]) };
      groups[0].incidents.push(member);
      groups[0].severity = Math.max(groups[0].severity, member.severity);
      return member;
    },
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByLabel("Stație").fill("BT-NEW-MEMBER");
  await page.getByLabel("Zonă").fill("Banat");
  await page.getByLabel("Tip eveniment").fill("VOLTAGE_DROP");
  await page.getByLabel("Severitate (1–5)").fill("5");
  await page.getByLabel("Clienți afectați").fill("24");
  await page.getByLabel("Latitudine").fill(String(coordinates.latitude));
  await page.getByLabel("Longitudine").fill(String(coordinates.longitude));
  await page.getByRole("button", { name: "+ Creează incident" }).click();
  await expect(page.getByRole("status")).toContainText("Incident creat");
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();

  const first = page.locator('.map-marker[data-group-id="group-seven"]');
  const second = page.locator('.map-marker[data-group-id="group-two"]');
  await expect(first).toHaveAttribute("aria-label", /8 rapoarte/);
  await expect(second).toHaveAttribute("aria-label", /2 rapoarte/);
  const arrival = page.locator('.report-arrival[data-report-id="new-member"]');
  await expect(arrival).toBeVisible();
  await expect(arrival).toHaveAttribute("data-target-group-id", "group-seven");
  await expect(arrival).toHaveCount(0, { timeout: 5000 });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-info")).toContainText("BT-NEW-MEMBER");
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-info")).not.toContainText("BT-NEW-MEMBER");
});

test("incoming report animation respects reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const coordinates = { latitude: 45.75, longitude: 21.23 };
  const groups: any[] = [group("group-reduced", 1, coordinates)];
  installBaseApi(page, {
    groups: () => groups,
    onIncident: body => {
      const member = { ...incident("group-reduced", 2, coordinates, "2026-11-14T10:20:00Z"), id: "reduced-member", stationId: String(body["stationId"]) };
      groups[0].incidents.push(member);
      return member;
    },
  });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByLabel("Stație").fill("BT-REDUCED-MOTION");
  await page.getByLabel("Zonă").fill("Banat");
  await page.getByLabel("Tip eveniment").fill("VOLTAGE_DROP");
  await page.getByLabel("Severitate (1–5)").fill("4");
  await page.getByLabel("Clienți afectați").fill("3");
  await page.getByLabel("Latitudine").fill(String(coordinates.latitude));
  await page.getByLabel("Longitudine").fill(String(coordinates.longitude));
  await page.getByRole("button", { name: "+ Creează incident" }).click();
  await expect(page.getByRole("status")).toContainText("Incident creat");
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  const arrival = page.locator('.report-arrival[data-report-id="reduced-member"]');
  await expect(arrival).toHaveCount(0);
  await expect(page.locator('.map-marker[data-group-id="group-reduced"]')).toHaveAttribute('aria-label', /2 rapoarte/);

});

test("dense coastal reports stay inside Romania and retain every intervention without long-distance scattering", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dense = Array.from({length:77},(_,i)=>{
    const item=group('dense-'+i,1,{latitude:44.1802+(i%3)*.0001,longitude:28.6502+(i%4)*.0001});
    return {...item,zone:'Dobrogea',incidents:item.incidents.map(row=>({...row,zone:'Dobrogea'}))};
  });
  installBaseApi(page,{groups:()=>dense});
  await login(page);
  await page.locator('nav button').filter({hasText:'Dispecerat'}).click();
  const map=page.getByRole('region',{name:'Harta avariilor din România'});
  await expect(map).toContainText('77 rapoarte deschise');
  const markers=map.locator('.map-marker');
  await expect.poll(()=>markers.count()).toBeGreaterThan(0);
  const geometry=await map.locator('svg').evaluate(svgElement=>{
    const svg=svgElement as SVGSVGElement;
    const country=svg.querySelector(':scope > path') as SVGPathElement;
    return Array.from(svg.querySelectorAll('.map-marker')).map(node=>{
      const point=(node.getAttribute('transform')||'').match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
      const x=Number(point[1]),y=Number(point[2]);
      const r=Number(node.querySelector('.cluster-core circle')!.getAttribute('r'))+1;
      const inside=Array.from({length:24},(_,i)=>{
        const p=svg.createSVGPoint();p.x=x+Math.cos(i*Math.PI/12)*r;p.y=y+Math.sin(i*Math.PI/12)*r;
        return country.isPointInFill(p);
      }).every(Boolean);
      return {inside,reports:Number(node.getAttribute('aria-label')!.match(/^(\d+)/)![1]),groups:Number(node.getAttribute('data-group-count')),
        offset:Math.hypot(x-Number(node.getAttribute('data-source-x')),y-Number(node.getAttribute('data-source-y')))};
    });
  });
  expect(geometry.length).toBeLessThanOrEqual(8);
  expect(geometry.every(marker=>marker.inside&&marker.offset<=90.01)).toBe(true);
  expect(geometry.reduce((sum,marker)=>sum+marker.reports,0)).toBe(77);
  expect(geometry.reduce((sum,marker)=>sum+marker.groups,0)).toBe(77);
  await markers.first().click();
  await expect(map.getByText('Zonă aglomerată',{exact:true})).toBeVisible();
  await expect(map.getByRole('combobox',{name:'Intervenție din zonă'})).toBeVisible();
  expect(await map.getByRole('combobox',{name:'Intervenție din zonă'}).locator('option').count()).toBeGreaterThan(1);
  await expect(map.locator('.report-arrival')).toHaveCount(0);
});

test('every category can save Database, S3 and FTP without YAML or restart', async ({ page }) => {
  test.setTimeout(60000);
  let active = { version: 10, rules: [
    { id: 'meters', category: 'METER_READING', storage: 'DATABASE' },
    { id: 'incident', category: 'INCIDENT', storage: 'S3' },
    { id: 'documents', category: 'CONNECTION_DOCUMENT', storage: 'S3' },
    { id: 'drones', category: 'DRONE_VIDEO', storage: 'S3' },
  ] };
  installBaseApi(page, {
    currentPolicy: () => active,
    onPolicy: (_method, _path, body) => {
      expect(body['expectedVersion']).toBe(active.version);
      active = { version: active.version + 1, rules: body['rules'] as typeof active.rules };
      return { json: active };
    },
  });
  await login(page);
  await page.locator('nav button').filter({ hasText: 'Politici de stocare' }).click();
  for (const category of ['METER_READING', 'INCIDENT', 'CONNECTION_DOCUMENT', 'DRONE_VIDEO']) {
    await page.locator('.category-card').filter({ hasText: category }).getByRole('button', { name: 'Configurează politica' }).click();
    const dialog = page.getByRole('dialog', { name: 'Configurează politica' });
    for (const storage of ['DATABASE', 'S3', 'FTP']) {
      await dialog.getByLabel('Destinație').selectOption(storage);
      await dialog.getByRole('button', { name: 'Aplică politica' }).click();
      await expect(dialog.getByRole('status')).toContainText(`Politica v${active.version} este activă`);
      expect(active.rules.find(rule => rule.category === category)?.storage).toBe(storage);
      await expect(dialog.getByRole('alert')).toHaveCount(0);
    }
    await dialog.getByRole('button', { name: 'Închide', exact: true }).click();
  }
  expect(active.version).toBe(22);
});
