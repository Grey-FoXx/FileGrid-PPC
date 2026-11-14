import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Explicit opt-in: these checks create fictitious data and temporarily pause the local ML worker.
const composeLive = process.env["FILEGRID_COMPOSE_LIVE"] === "1" &&
  process.env["FILEGRID_BASE_URL"] === "https://localhost:8443";
async function login(page: Page, user: string) {
  const line = readFileSync(resolve("../.runtime/accounts.properties"), "utf8")
    .split("\n").find(value => value.startsWith(user + "="));
  if (!line) throw new Error("Missing local test account: " + user);
  const password = line.slice(line.indexOf("=") + 1).split(":")[0];
  await page.goto("/");
  await page.getByLabel("Utilizator").fill(user);
  await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Intră în platformă" }).click();
  await expect(page.getByRole("button", { name: "Deconectare", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reîmprospătează", exact: true })).toBeEnabled();
}
const ml = (action: "pause" | "unpause") => execFileSync("docker", ["compose", action, "ml-worker"], {
  cwd: resolve(".."), stdio: "pipe",
});

test("Compose: file remains downloadable while the actual ML worker is paused", async ({ page }) => {
  test.skip(!composeLive, "Set FILEGRID_COMPOSE_LIVE=1 and FILEGRID_BASE_URL=https://localhost:8443");
  test.setTimeout(60000);
  await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true }));
  await login(page, "admin");
  const content = Buffer.from("SYNTHETIC UI ACCEPTANCE - independent ML availability\n");
  const filename = "ui-independent-ml-" + Date.now() + ".txt";
  ml("pause");
  let incidentId = "";
  try {
    await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
    await page.getByRole("button", { name: "+ Creează incident", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Incident creat");
    const selectedIncident = page.getByRole("combobox", { name: "Incident asociat", exact: true });
    await expect(selectedIncident).not.toHaveValue("");
    incidentId = await selectedIncident.inputValue();
    await page.getByLabel("Fișier pentru transfer", { exact: true }).setInputFiles({ name: filename, mimeType: "text/plain", buffer: content });
    await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
    await expect(page.getByRole("status")).toContainText("Fișier disponibil", { timeout: 20000 });
    await page.locator("nav button").filter({ hasText: "Dispecerat" }).click();
    const card = page.locator(".incident-card").filter({ hasText: incidentId.slice(0, 8) });
    await expect(card.locator(".badge").filter({ hasText: /^PENDING$/ })).toBeVisible();
    await expect(card.getByText("AVAILABLE", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "Descarcă " + filename, exact: true }).click();
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    await expect(page.getByRole("status")).toContainText("SHA-256 original = SHA-256 recuperat");
    await page.screenshot({ path: "../.runtime/ui-ml-pending.png", fullPage: true });
  } finally {
    ml("unpause");
  }
  const card = page.locator(".incident-card").filter({ hasText: incidentId.slice(0, 8) });
  await expect(card.locator(".badge").filter({ hasText: /^COMPLETED$/ })).toBeVisible({ timeout: 25000 });
  await expect(card.getByRole("heading", { name: "Model 1 · Impact și urgență" })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Model 2 · Corelare incidente" })).toBeVisible();
});

test("Compose: all four real human roles can navigate their permitted mobile workflows", async ({ page }) => {
  test.skip(!composeLive, "Set FILEGRID_COMPOSE_LIVE=1 and FILEGRID_BASE_URL=https://localhost:8443");
  test.setTimeout(60000);
  for (const [user, categories] of [["admin", 3], ["dispatcher", 2], ["field", 2], ["connection", 1]] as const) {
    await login(page, user);
    await page.setViewportSize({ width: 390, height: 844 });
    if (user === "connection") await expect(page.locator("nav button").filter({ hasText: "Dispecerat" })).toHaveCount(0);
    if (user === "connection" || user === "field") await expect(page.locator("nav button").filter({ hasText: "Citiri contoare" })).toHaveCount(0);
    await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
    await expect(page.getByRole("combobox", { name: "Categorie", exact: true }).locator("option")).toHaveCount(categories);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../.runtime/ui-${user}-mobile.png`, fullPage: true });
    await page.getByRole("button", { name: "Deconectare", exact: true }).click();
  }
});

test("Compose: real multipart upload resumes after page reload and recovers identical bytes", async ({ page }) => {
  test.skip(!composeLive, "Set FILEGRID_COMPOSE_LIVE=1 and FILEGRID_BASE_URL=https://localhost:8443");
  test.setTimeout(60000);
  await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true }));
  await login(page, "admin");
  const content = Buffer.alloc(8 * 1024 * 1024 + 19, 65);
  const filename = "synthetic-resume-" + Date.now() + ".mp4";
  let firstPartRequests = 0, blockedOnce = false;
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  const pending = new Promise<void>(resolve => started = resolve);
  page.on("request", request => {
    if (request.method() === "PUT" && /\/parts\/1$/.test(new URL(request.url()).pathname)) firstPartRequests++;
  });
  await page.route("**/api/v1/upload-sessions/*/parts/2", async route => {
    if (!blockedOnce) { blockedOnce = true; started(); await held; }
    await route.continue().catch(() => {});
  });
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("combobox", { name: "Categorie", exact: true }).selectOption("DRONE_VIDEO");
  await page.getByLabel("Fișier pentru transfer", { exact: true }).setInputFiles({ name: filename, mimeType: "video/mp4", buffer: content });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await pending;
  await page.getByRole("button", { name: "Pauză", exact: true }).click();
  await expect(page.getByRole("button", { name: "Încarcă / reia transferul" })).toBeEnabled();
  await page.reload(); release();
  await login(page, "admin");
  await page.locator("nav button").filter({ hasText: "Încarcă fișiere" }).click();
  await page.getByRole("button", { name: "Reia " + filename, exact: false }).click();
  await page.getByLabel("Fișier pentru transfer", { exact: true }).setInputFiles({ name: filename, mimeType: "video/mp4", buffer: content });
  await page.getByRole("button", { name: "Încarcă / reia transferul" }).click();
  await expect(page.getByRole("status")).toContainText("Fișier disponibil", { timeout: 20000 });
  expect(firstPartRequests).toBe(1);
  await page.getByRole("button", { name: "▤ Fișiere", exact: true }).click();
  await page.getByLabel("Caută după nume").fill(filename);
  await page.getByRole("button", { name: "Caută", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: filename });
  await expect(row).toContainText("AVAILABLE");
  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "↓ Descarcă", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).equals(content)).toBe(true);
  await expect(page.getByRole("status")).toContainText("SHA-256 original = SHA-256 recuperat");
});
