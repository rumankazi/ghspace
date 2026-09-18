import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { closeDb, db } from "./client.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

await migrate(db(), { migrationsFolder });
console.log("migrations applied");
await closeDb();
