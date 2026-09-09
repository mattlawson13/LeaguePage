// One-off helper: seeds data/managers.json with every manager the ingest
// layer has seen, so the commish only has to fill in bios rather than also
// building the file's structure by hand. Never overwrites an existing entry.
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db/client";
import { getManagers } from "../lib/stats";

const MANAGERS_PATH = path.join(process.cwd(), "data", "managers.json");

function main() {
  const db = getDb();
  const managers = getManagers(db);

  const existing: Record<string, unknown> = fs.existsSync(MANAGERS_PATH)
    ? JSON.parse(fs.readFileSync(MANAGERS_PATH, "utf-8"))
    : {};

  for (const m of managers) {
    if (existing[m.user_id]) continue;
    existing[m.user_id] = {
      displayName: m.display_name,
      nickname: "",
      photo: "",
      joinedYear: Number(m.first_season),
      bio: "",
      catchphrase: "",
      knownFor: [],
    };
  }

  fs.writeFileSync(MANAGERS_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(`data/managers.json: ${Object.keys(existing).length} managers`);
}

main();
