import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("live PostgreSQL/MinIO/FTP UI upload and recovery", async ({ page }) => {
  test.skip(
    process.env["FILEGRID_LIVE"] !== "1",
    "Set FILEGRID_LIVE=1 with the local API running",
  );
  const accounts = readFileSync(
    resolve("../.runtime/accounts.properties"),
    "utf8",
  );
  const password = accounts
    .split("\n")
    .find((x) => x.startsWith("admin="))!
    .split("=")[1]
    .split(":")[0];
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(
    page.getByRole("heading", { name: "Rețeaua, în perspectivă." }),
  ).toBeVisible();
  await page.screenshot({ path: "../.runtime/ui-desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "+ Încarcă fișier", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Categorie", exact: true })
    .selectOption("CONNECTION_DOCUMENT");
  const data = Buffer.from("FICTITIOUS DOCUMENT - LIVE BROWSER VERIFICATION\n");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "live-browser-document.txt",
      mimeType: "text/plain",
      buffer: data,
    });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Fișier disponibil · SHA-256 verificat · S3",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await page.getByLabel("Caută după nume").fill("live-browser-document");
  await page.getByRole("button", { name: "Caută", exact: true }).click();
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "live-browser-document.txt" })
    .first();
  await expect(row).toContainText("AVAILABLE");
  const pending = page.waitForEvent("download");
  await row.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks)).toEqual(data);
  await expect(page.getByRole("status")).toContainText(
    "SHA-256 original = SHA-256 recuperat",
  );
  await page
    .locator("nav button")
    .filter({ hasText: "Încarcă fișiere" })
    .click();
  await page
    .getByRole("combobox", { name: "Categorie", exact: true })
    .selectOption("INCIDENT");
  await page
    .getByRole("button", { name: "+ Creează incident", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Incident creat");
  await page
    .getByRole("combobox", { name: "Tip atașament", exact: true })
    .selectOption("LEGACY_LOG");
  await page
    .getByRole("combobox", { name: "Sensibilitate", exact: true })
    .selectOption("NON_SENSITIVE");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "live-browser-diagnostic.log",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic legacy diagnosis; no personal data"),
    });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Fișier disponibil · SHA-256 verificat · FTP",
    { timeout: 15000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
  await expect(
    page.getByRole("heading", { name: "Dispecerat.", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "../.runtime/ui-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
