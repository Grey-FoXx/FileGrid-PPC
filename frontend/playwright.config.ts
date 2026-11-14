import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:4200",
    headless: true,
    launchOptions: process.env["CI"]
      ? {}
      : {
          executablePath: process.env["CHROME_BIN"] || "/usr/bin/google-chrome",
        },
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:4200",
    reuseExistingServer: !process.env["CI"],
    timeout: 60000,
  },
});
