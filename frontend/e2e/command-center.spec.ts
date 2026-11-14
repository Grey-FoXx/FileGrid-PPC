import { test, expect } from "@playwright/test";

test("offline scenarios and map clusters never write to the API", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/v1/**", route => { requests.push(route.request().method()); return route.abort(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Deschide Demo simulation" }).click();
  const cc = page.locator("filegrid-command-center");
  await expect(cc.getByRole("button", { name: "Live", exact: true })).toBeDisabled();
  await cc.getByRole("combobox", { name: "Scenariu", exact: true }).selectOption("storm");
  await expect(cc.locator(".cc-marker.cluster").first()).toBeVisible();
  await cc.locator(".cc-marker.cluster").first().click();
  await cc.locator(".cc-cluster-list button").last().click();
  await expect(cc.locator(".cc-journey")).toBeVisible();
  await expect(cc.locator("p.cc-synthetic")).toBeVisible();
  const stormCount = await cc.locator(".cc-metrics strong").first().textContent();
  await cc.getByRole("combobox", { name: "Scenariu", exact: true }).selectOption("recovery");
  await expect(cc.locator(".cc-metrics strong").first()).not.toHaveText(stormCount!);
  await cc.getByRole("button", { name: "Mărește harta" }).click();
  await expect(cc.locator(".cc-zoom")).toContainText("110%");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(requests).toEqual([]);
});

test("playground rejects sensitive FTP without inventing an active policy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Deschide Demo simulation" }).click();
  const lab = page.locator("filegrid-policies");
  await lab.getByRole("button", { name: "Simulează un caz ipotetic" }).click();
  await lab.getByRole("combobox", { name: "Categorie", exact: true }).selectOption("CONNECTION_DOCUMENT");
  await lab.getByLabel("Destinație ipotetic propusă").selectOption("FTP");
  await expect(lab.locator(".target-result")).toContainText("Nu");
  await expect(lab.locator(".target-result")).toContainText("nu este permisă");
  await lab.getByRole("button", { name: "Explorează configurația activă" }).click();
  await expect(lab.locator("#routing-result-title")).toContainText("Nedeterminată");
  await expect(lab).toContainText("Not measured");
});

test("active S3 legacy policy remains S3 when FTP is a permissible hypothetical alternative", async ({ page }) => {
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith("/me") ? { username: "admin", role: "ADMIN" }
      : path.endsWith("/policies") ? { version: 42, rules: [{ id: "legacy-on-s3", category: "INCIDENT", storage: "S3" }] }
      : path.endsWith("/stats/technical") ? { windowMinutes: 60, series: [] }
      : path.endsWith("/stats/business") ? { files: 0, readings: 0, incidents: 0, mode: "NORMAL", recentIncidents: 0, zones: [] }
      : { items: [], total: 0, page: 0, size: 25 };
    return route.fulfill({ json: result });
  });
  await page.goto("/");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await page.getByRole("button", { name: "Storage Decision Lab", exact: false }).click();
  const lab = page.locator("filegrid-policies");
  await expect(lab).toContainText("legacy-on-s3");
  await lab.getByRole("button", { name: "Simulează un caz ipotetic" }).click();
  await lab.getByLabel("Tip atașament").selectOption("LEGACY_LOG");
  await lab.getByRole("combobox", { name: "Sensibilitate", exact: true }).selectOption("NON_SENSITIVE");
  await lab.getByLabel("Destinație ipotetic propusă").selectOption("FTP");
  await expect(lab.locator(".target-result")).toContainText("politica activă păstrează ruta către Object storage");
  await lab.getByRole("button", { name: "Explorează configurația activă" }).click();
  await expect(lab.locator("#routing-result-title")).toContainText("S3");
});
