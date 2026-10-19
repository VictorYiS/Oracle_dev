import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`npm run build` first), served by `vite preview`.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", locale: "en-US" },
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox proves the simulation gives the same hashes in another engine.
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /determinism\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /(smoke|manual-loop|i18n|layout)\.spec\.ts/ },
  ],
});
