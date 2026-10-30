import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
if (process.env.DEMO_MODE === "true") {
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_demo")) throw new Error("Demonstração exige banco dedicado com nome terminado em _demo.");
  const url = new URL(process.env.DATABASE_URL!);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+_demo$/.test(database)) throw new Error("Nome do banco demo inválido.");
  url.pathname = "/postgres";
  let admin = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
  try { await admin.connect(); } catch {
    await admin.end().catch(() => {});
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Banco remoto de demonstração indisponível.");
    execFileSync("docker", ["compose", "up", "-d", "db"], { stdio: "inherit", windowsHide: true });
    let connected = false;
    for (let attempt = 0; attempt < 30 && !connected; attempt++) {
      admin = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 1000 });
      try { await admin.connect(); connected = true; } catch { await admin.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!connected) throw new Error("PostgreSQL de demonstração não iniciou.");
  }
  try { if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`); } finally { await admin.end(); }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "generate"], { stdio: "inherit" });
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit" });
  const { seedDemo } = await import("../prisma/demo");
  await seedDemo();
  const { db } = await import("../src/lib/db"); await db.$disconnect();
}
