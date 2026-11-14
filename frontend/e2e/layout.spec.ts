import { test, expect } from "@playwright/test";

test("populated pages keep long names, policy data and model results within the viewport", async ({ page }) => {
  const long = "SyntheticNetworkDiagnostic".repeat(12);
  const file = { id: "file-1", filename: long + ".txt", category: "INCIDENT", sizeBytes: 4000,
    status: "AVAILABLE", sha256: "a".repeat(64), storage: "S3", integrityStatus: "VERIFIED",
    owner: "admin", policyVersion: "1", routingReason: long, createdAt: "2026-11-14T10:00:00Z" };
  const incident = { id: "incident-1", stationId: long, zone: long, eventType: long, severity: 5,
    affectedCustomers: 10000, mlStatus: "COMPLETED", attachments: [file], analysis: {
      priorityScore: 95, priorityClass: "CRITICAL", clusterId: -1, clusterSize: 1,
      recommendation: "IMMEDIATE_HUMAN_REVIEW", reasons: [long], synthetic: true,
      modelVersions: { impact: long, correlation: long },
    } };
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    const list = (items: unknown[]) => ({ items, total: items.length, page: 0, size: 25 });
    const result = path.endsWith("/me") ? { username: "admin", role: "ADMIN" }
      : path.endsWith("/files") ? list([file])
      : path.endsWith("/incidents") ? list([incident])
      : path.endsWith("/meter-readings") ? list([{ readingId: long, meterId: long, sequenceNumber: 1000, energyKwh: 999, fileId: file.id, measuredAt: file.createdAt }])
      : path.endsWith("/stats/technical") ? { windowMinutes: 60, series: [{ category: "INCIDENT", storage: "S3", operation: long,
          operations: 123, bytesPerSecond: 80000, operationsPerSecond: 2, p50Ms: 12, p95Ms: 22, p99Ms: 44, errorRate: 0.2 }] }
      : path.endsWith("/stats/business") ? { files: 1000, readings: 2000, incidents: 25, recentIncidents: 25, mode: "STORM", zones: [{ zone: long, incidents: 25 }] }
      : { version: 1, rules: [{ id: long, category: "INCIDENT", storage: "S3" }] };
    return route.fulfill({ json: result });
  });
  await page.goto("/");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const title of ["Privire de ansamblu", "Încarcă fișiere", "Fișiere", "Dispecerat", "Citiri contoare", "Politici de stocare"]) {
      if (title === "Fișiere") await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
      else await page.locator("nav button").filter({ hasText: title }).click();
      await expect(page.getByRole("button", { name: "Reîmprospătează", exact: true })).toBeEnabled();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${title} overflows at ${width}px` }).toBe(true);
      if (title === "Fișiere") {
        await page.getByRole("button", { name: "Detalii", exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `File details overflow at ${width}px` }).toBe(true);
      }
      if (title === "Politici de stocare") {
        await page.getByText("Vezi configurația activă", { exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
});
