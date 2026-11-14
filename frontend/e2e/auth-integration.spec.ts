import { test, expect, Page } from "@playwright/test";

const empty = { items: [], page: 0, size: 25, total: 0 };
const record = (filename: string) => ({
  id: filename, filename, category: "INCIDENT", sizeBytes: 12,
  status: "AVAILABLE", storage: "S3", createdAt: "2026-11-14T10:00:00Z",
});
async function login(page: Page, username = "admin") {
  await page.getByLabel("Utilizator").fill(username);
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const connection = route.request().headers()["authorization"] ===
      "Basic " + Buffer.from("connection:fixture").toString("base64");
    const value = path.endsWith("/me")
      ? { username: connection ? "connection" : "admin", role: connection ? "CONNECTION_AGENT" : "ADMIN" }
      : path.endsWith("/stats/business")
        ? { files: 42, readings: 7, incidents: 3, mode: "NORMAL", recentIncidents: 0, zones: [] }
        : path.endsWith("/stats/technical") ? { series: [] } : empty;
    await route.fulfill({ json: value });
  });
  await page.goto("/");
});
test("partial API failure preserves successful sections and is not a network outage", async ({ page }) => {
  await page.route("**/api/v1/stats/technical", route => route.fulfill({
    status: 403, headers: { "X-Correlation-ID": "forbidden-metrics" },
    json: { detail: "Metrics access denied", code: "FORBIDDEN" },
  }));
  await login(page);
  await expect(page.locator(".stat").first()).toContainText("42");
  await expect(page.getByRole("alert")).toContainText("Nu ai permisiunea");
  await expect(page.getByRole("alert")).toContainText("forbidden-metrics");
  await expect(page.getByText("Conectat la FileGrid", { exact: true })).toBeVisible();
});
test("network error preserves authentication and marks connectivity separately", async ({ page }) => {
  await page.route("**/api/v1/stats/technical", route => route.abort("failed"));
  await login(page);
  await expect(page.locator(".stat").first()).toContainText("42");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Reconectare…", { exact: true })).toBeVisible();
});
test("401 during silent refresh ends authentication and allows a fresh login", async ({ page }) => {
  await login(page);
  await expect(page.locator(".stat").first()).toContainText("42");
  await page.route("**/api/v1/files?**", route => route.fulfill({ status: 401, json: { detail: "Expired" } }));
  // The existing five-second background refresh must handle 401 even when silent.
  await expect(page.getByRole("button", { name: "Intră în platformă" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("alert")).toContainText("Autentificarea nu mai este validă");
  await page.unroute("**/api/v1/files?**");
  await login(page, "connection");
  await expect(page.getByRole("heading", { name: "Fișierele rețelei." })).toBeVisible();
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await expect(page.getByRole("combobox", { name: "Categorie", exact: true })).toHaveValue("CONNECTION_DOCUMENT");
});
test("latest search and page win while older responses remain pending", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let started!: () => void;
  const pending = new Promise<void>(resolve => started = resolve);
  await page.route("**/api/v1/files?**", async route => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search");
    if (search === "old") { started(); await gate; }
    const filename = search === "new" ? "new-result.txt" : "old-result.txt";
    await route.fulfill({ json: { ...empty, total: 51, items: [record(filename)] } });
  });
  await login(page);
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await page.getByLabel("Caută după nume").fill("old");
  await page.getByRole("button", { name: "Caută", exact: true }).click();
  await pending;
  await page.getByLabel("Caută după nume").fill("new");
  await page.getByRole("button", { name: "Caută", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tabel de date", exact: true }).locator("tbody")).toContainText("new-result.txt");
  release();
  await expect(page.getByRole("region", { name: "Tabel de date", exact: true }).locator("tbody")).not.toContainText("old-result.txt");
  const request = page.waitForRequest(req => new URL(req.url()).searchParams.get("page") === "2");
  await page.getByRole("button", { name: "Înainte", exact: false }).click();
  await page.getByRole("button", { name: "Înainte", exact: false }).click();
  await request;
  await expect(page.getByText("Pagina 3", { exact: true })).toBeVisible();
});
test("logout aborts old account requests and resets filters before another account logs in", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let started!: () => void;
  const pending = new Promise<void>(resolve => started = resolve);
  await page.route("**/api/v1/stats/business", async route => {
    started(); await gate;
    await route.fulfill({ status: 401, json: { detail: "Old account expired" } });
  });
  await login(page);
  await pending;
  await page.getByRole("button", { name: "Deconectare", exact: true }).click();
  await login(page, "connection");
  release();
  await expect(page.getByRole("heading", { name: "Fișierele rețelei." })).toBeVisible();
  await expect(page.getByLabel("Caută după nume")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
