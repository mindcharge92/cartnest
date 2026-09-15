import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: "**/*.pw.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.BROWSER_BASE_URL ?? "http://localhost:3000",
    launchOptions: {
      // The developer workstation already has Chrome; this avoids making local
      // verification depend on a separate 196 MB browser download.
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "../../artifacts/browser-results",
  reporter: [["list"], ["json", { outputFile: "../../artifacts/browser-results/report.json" }]],
});
