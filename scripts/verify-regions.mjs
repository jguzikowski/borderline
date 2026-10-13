/**
 * Checks that every shape the browser can click has an entry in the
 * server's answer key. A mismatch means a shape is unanswerable: the
 * client offers it, the server calls it an unknown shape.
 *
 *   node scripts/verify-regions.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const PUB = path.join(process.cwd(), "public", "regions");
const KEY = path.join(process.cwd(), "server-data", "answers.json");

const answers = JSON.parse(await fs.readFile(KEY, "utf8"));
const files = (await fs.readdir(PUB)).filter((f) => f.endsWith(".json"));

let problems = 0;

if (!files.length) {
  console.log("No region files. Run: npm run build:regions");
  process.exit(1);
}

for (const file of files.sort()) {
  const id = file.replace(/\.json$/, "");
  const region = JSON.parse(await fs.readFile(path.join(PUB, file), "utf8"));
  const key = answers[id];

  if (!key) {
    console.log(`${id.padEnd(16)} MISSING from answers.json entirely`);
    problems++;
    continue;
  }

  const keyCodes = new Set(Object.keys(key));
  const targetCodes = region.targets.map((t) => t.code);

  const orphans = [...new Set(targetCodes.filter((c) => !keyCodes.has(c)))];
  const unused = [...keyCodes].filter((c) => !targetCodes.includes(c));

  // Two features sharing a code means two shapes resolve to one name, so
  // the round can never complete: the client counts both, the server one.
  const seen = new Map();
  for (const c of targetCodes) seen.set(c, (seen.get(c) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);

  if (orphans.length || unused.length || dupes.length || targetCodes.length !== keyCodes.size) {
    problems++;
    console.log(`${id.padEnd(16)} shapes ${targetCodes.length}, answers ${keyCodes.size}`);
    if (orphans.length) console.log(`  clickable but unanswerable: ${orphans.join(", ")}`);
    if (unused.length) console.log(`  in answers but not drawn:   ${unused.map((c) => `${c} (${key[c]})`).join(", ")}`);
    if (dupes.length) console.log(`  duplicate codes:            ${dupes.map(([c, n]) => `${key[c] ?? c} ×${n}`).join(", ")}`);
  }
}

if (problems) {
  console.log(`\n${problems} region(s) with problems. Re-run npm run build:regions, and if it persists the region's member list has a duplicate or an unmatched name.`);
  process.exit(1);
}
console.log(`All ${files.length} regions match the answer key.`);
