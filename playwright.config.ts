import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`npm run build` first), served by `vite preview`.
// Headless Firefox draws with a software compositor that is far slower than real Firefox at
// moving a 3D scene, so Firefox's frame times are measured headed, on the machine's GPU:
// E2E_GPU=1 npx playwright test tests/e2e/transitions.spec.ts --project=firefox-gpu
// Always starts its own server: reusing whatever already listens on the port once tested a
// stale build from another checkout. If the port is taken, the run fails; pick another with
// E2E_PORT=4180 npm run e2e.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: URL, locale: "en-US" },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox: the same hashes in another engine, and the paper theatre in another renderer.
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /(determinism|theatre|pending)\.spec\.ts/,
    },
    ...(process.env.E2E_GPU
      ? [
          {
            name: "firefox-gpu",
            use: { ...devices["Desktop Firefox"], headless: false },
            testMatch: /transitions\.spec\.ts/,
          },
        ]
      : []),
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: /(smoke|i18n|layout|keyboard|theatre|transitions|window|pending)\.spec\.ts/,
    },
  ],
});
