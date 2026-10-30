import "dotenv/config";
import { seedDemo } from "./demo";
import { db } from "../src/lib/db";
seedDemo().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
