import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  !decodeURIComponent(new URL(testUrl).pathname.slice(1)).endsWith("_test")
) {
  throw new Error(
    "E2E exige TEST_DATABASE_URL com nome de banco terminado em _test. Migre esse banco antes de executar.",
  );
}
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testUrl,
      DEMO_MODE: "false",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? randomBytes(48).toString("hex"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
