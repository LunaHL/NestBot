import fs from "node:fs";
import path from "node:path";
import { db } from "./index.js";
import { logger } from "../lib/logger.js";

const MIGRATIONS_DIR = path.resolve("src/db/migrations");

export function migrate() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  db.exec("BEGIN");
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      db.exec(sql);
      logger.info({ file }, "Applied migration");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}