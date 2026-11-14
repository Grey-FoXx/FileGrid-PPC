import { test, expect, Page } from "@playwright/test";
import { createHash } from "node:crypto";
const data = Buffer.from("fictitious connection application\n");
const file = {
  id: "file-1",
  category: "CONNECTION_DOCUMENT",
  filename: "application.txt",
  contentType: "text/plain",
  sizeBytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  status: "AVAILABLE",
  integrityStatus: "VERIFIED",
  storage: "S3",
  owner: "admin",
  policyVersion: "1",
  routingReason: "Rule connection-private",
  createdAt: "2026-11-14T10:00:00Z",
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result: unknown = {};
    let status = 200;
    if (path.endsWith("/me")) {
      if (
        route.request().headers()["authorization"] !==
        "Basic " + Buffer.from("admin:fixture").toString("base64")
      ) {
        status = 401;
        result = { detail: "Credențiale invalide" };
      } else result = { username: "admin", role: "ADMIN" };
    } else if (path.endsWith("/stats/business"))
      result = {
        files: 1,
        readings: 4,
        incidents: 0,
        mode: "NORMAL",
        recentIncidents: 0,
        zones: [],
      };
    else if (path.endsWith("/stats/technical")) result = { series: [] };
    else if (path.endsWith("/files"))
      result = { items: [file], page: 0, size: 25, total: 1 };
    else if (path.endsWith("/incidents") || path.endsWith("/meter-readings"))
      result = { items: [], page: 0, size: 25, total: 0 };
    else if (path.endsWith("/files/file-1/content")) {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: data,
      });
      return;
    } else if (path.endsWith("/files/file-1")) result = file;
    else if (
      path.endsWith("/upload-sessions") ||
      path.includes("/upload-sessions/session-1")
    ) {
      if (path.endsWith("/content"))
        expect(route.request().postDataBuffer()).toEqual(data);
      if (path.endsWith("/complete")) {
        status = 202;
        result = file;
      } else {
        status = route.request().method() === "POST" ? 201 : 200;
        result = {
          sessionId: "session-1",
          fileId: "file-1",
          uploadMode: "SINGLE",
          partSizeBytes: 8388608,
          expiresAt: "2099-01-01T00:00:00Z",
          status: "CREATED",
          confirmedParts: [],
        };
      }
    } else if (path.endsWith("/policies"))
      result = {
        version: 1,
        rules: [{ category: "CONNECTION_DOCUMENT", storage: "S3" }],
      };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
});
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(
    page.getByRole("heading", { name: "Rețeaua, în perspectivă." }),
  ).toBeVisible();
}
test("authentication errors and dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Parolă", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("alert")).toContainText("Credențiale invalide");
  await page.getByLabel("Parolă", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(
    page.getByRole("heading", { name: "Rețeaua, în perspectivă." }),
  ).toBeVisible();
  await expect(
    page.getByText("Metricile apar după primele operații.", { exact: false }),
  ).toBeVisible();
});
test("worker checksum, binary upload, search and verified download", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "+ Încarcă fișier", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Categorie", exact: true })
    .selectOption("CONNECTION_DOCUMENT");
  await page.locator("input[type=file]").setInputFiles({
    name: "application.txt",
    mimeType: "text/plain",
    buffer: data,
  });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await expect(page.getByRole("status")).toContainText("Fișier disponibil");
  await expect(page.locator(".hash code")).toHaveText(file.sha256);
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await page.getByLabel("Caută după nume").fill("application");
  await page.getByRole("button", { name: "Caută", exact: true }).click();
  await expect(
    page.getByText("application.txt", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Detalii", exact: true }).click();
  await expect(
    page.getByText("Rule connection-private", { exact: true }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("application.txt");
  await expect(page.getByRole("status")).toContainText(
    "SHA-256 original = SHA-256 recuperat",
  );
});
test("mobile navigation and empty ML state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await expect(
    page.getByRole("heading", { name: "Dispecerat.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Niciun incident raportat.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
