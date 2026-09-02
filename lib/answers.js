import answers from "@/server-data/answers.json";

// server-data/ is outside public/, so this never ships to the browser.
export function nameForCode(regionId, code) {
  return answers?.[regionId]?.[code] ?? null;
}

export function codesForRegion(regionId) {
  return Object.keys(answers?.[regionId] ?? {});
}

export function namesForRegion(regionId) {
  return Object.values(answers?.[regionId] ?? {});
}
