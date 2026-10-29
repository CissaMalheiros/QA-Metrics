import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    "Defina TEST_DATABASE_URL para um banco PostgreSQL dedicado aos testes.",
  );
const databaseName = decodeURIComponent(new URL(testUrl).pathname.slice(1));
if (!databaseName.endsWith("_test"))
  throw new Error(
    "Por segurança, TEST_DATABASE_URL deve apontar para um banco cujo nome termine em _test.",
  );
process.env.DATABASE_URL = testUrl;
process.env.BETTER_AUTH_SECRET ??= randomBytes(48).toString("hex");
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
