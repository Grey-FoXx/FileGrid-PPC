import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const externalURL = process.env["FILEGRID_BASE_URL"];
const chrome = process.env["CHROME_BIN"] || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: externalURL || "http://localhost:4200",
    ignoreHTTPSErrors: !!externalURL?.startsWith("https://localhost"),
    headless: true,
    launchOptions: chrome ? { executablePath: chrome } : {},
  },
  webServer: externalURL ? undefined : {
    command: "npm start",
    url: "http://localhost:4200",
    reuseExistingServer: !process.env["CI"],
    timeout: 60000,
  },
});
