import fs from "fs";
import path from "path";
import { getDb } from "../src/lib/db";

async function runMigrations(): Promise<void> {
  const db = getDb();
  let currentFile = "";

  try {
    // 1. Ensure migrations directory exists
    const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    // 2. Ensure schema_migrations tracking table exists
    await db`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz DEFAULT now()
      )
    `;

    // 3. Fetch already applied migrations
    const appliedRows = await db<{ filename: string }[]>`
      SELECT filename FROM schema_migrations
    `;
    const appliedSet = new Set(appliedRows.map((row) => row.filename));

    // 4. Read and sort all .sql migration files
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    // 5. Apply each unapplied migration inside a transaction
    for (const file of migrationFiles) {
      currentFile = file;
      if (appliedSet.has(file)) {
        console.log(`skipped ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf-8");

      await db.begin(async (tx) => {
        await tx.unsafe(sqlContent);
        await tx`
          INSERT INTO schema_migrations (filename)
          VALUES (${file})
        `;
      });

      console.log(`applied ${file}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fileContext = currentFile ? ` [${currentFile}]` : "";
    console.error(
      `Migration error${fileContext}: ${message.replace(/\r?\n/g, " ")}`,
    );
    process.exit(1);
  } finally {
    await db.end();
  }
}

runMigrations();
