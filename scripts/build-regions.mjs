/**
 * Downloads Natural Earth once, simplifies it, and writes one small file
 * per region into public/regions/, plus a server-only answer key.
 *
 * Run with: npm run build:regions
 *
 * Shape names never reach the browser. Each target gets an opaque code and
 * the server holds the code-to-name map, so reading the network payload
 * doesn't hand you the answers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as topojson from "topojson-client";
import mapshaper from "mapshaper";
import { REGIONS } from "../data/regions.js";
import { canonical, norm } from "../lib/names.js";

const SOURCES = {
  world: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
  us: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
};
const OBJECT = { world: "countries", us: "states" };

const OUT_PUBLIC = path.join(process.cwd(), "public", "regions");
const OUT_SERVER = path.join(process.cwd(), "server-data");
const CACHE = path.join(process.cwd(), ".atlas-cache");

const codeFor = (regionId, name) =>
  crypto.createHash("sha256").update(`${regionId}::${name}`).digest("hex").slice(0, 8);

async function atlas(kind) {
  await fs.mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, `${kind}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    process.stdout.write(`downloading ${kind} atlas… `);
    const res = await fetch(SOURCES[kind]);
    if (!res.ok) throw new Error(`${kind} atlas: HTTP ${res.status}`);
    const text = await res.text();
    await fs.writeFile(file, text);
    console.log("done");
    return JSON.parse(text);
  }
}

// d3-geo treats polygons as spherical and expects exterior rings wound
// clockwise. RFC 7946 GeoJSON mandates the opposite, and mapshaper emits
// RFC 7946 by default. Get this backwards and d3 fills the entire globe
// minus the country, which looks like one giant beige rectangle.
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return sum;
}

function windRing(ring, wantClockwise) {
  // Positive shoelace sum here means clockwise in lon/lat space.
  const clockwise = ringArea(ring) > 0;
  return clockwise === wantClockwise ? ring : ring.slice().reverse();
}

function rewindPolygon(rings) {
  // First ring is the outline, the rest are holes and run the other way.
  return rings.map((r, i) => windRing(r, i === 0));
}

function rewind(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: rewindPolygon(geometry.coordinates) };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(rewindPolygon) };
  }
  return geometry;
}

async function simplify(features, percent) {
  if (!features.length) return [];
  const input = JSON.stringify({ type: "FeatureCollection", features });
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify ${percent}% keep-shapes -clean -o out.json gj2008`,
    { "in.json": Buffer.from(input) }
  );
  const parsed = JSON.parse(Buffer.from(out["out.json"]).toString("utf8"));
  // gj2008 asks mapshaper for the old winding convention; the explicit
  // rewind guarantees it regardless of mapshaper version.
  return parsed.features.map((f) => ({ ...f, geometry: rewind(f.geometry) }));
}

function bbox(features) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < x0) x0 = c[0];
      if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1];
      if (c[1] > y1) y1 = c[1];
    } else c.forEach(walk);
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return [x0, y0, x1, y1];
}

function overlaps(f, box) {
  const b = bbox([f]);
  return !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
}

async function main() {
  await fs.mkdir(OUT_PUBLIC, { recursive: true });
  await fs.mkdir(OUT_SERVER, { recursive: true });

  const geo = {};
  for (const kind of ["world", "us"]) {
    const topo = await atlas(kind);
    geo[kind] = topojson.feature(topo, topo.objects[OBJECT[kind]]).features.map((f) => ({
      ...f,
      properties: { name: canonical(f.properties?.name || f.properties?.NAME || "") },
    }));
  }

  const answers = {};
  const manifest = [];
  const unmatched = [];

  for (const region of REGIONS) {
    const all = geo[region.atlas];
    const wanted = new Set(region.members);
    const wantedNorm = new Set(region.members.map(norm));

    const targets = all.filter(
      (f) => wanted.has(f.properties.name) || wantedNorm.has(norm(f.properties.name))
    );
    const found = new Set(targets.map((f) => f.properties.name));
    for (const m of region.members) {
      if (!found.has(m) && !targets.some((f) => norm(f.properties.name) === norm(m))) {
        unmatched.push(`${region.id}: ${m}`);
      }
    }

    // Two rings of context. The near ring gives the immediate neighbours
    // at the default zoom. The far ring only matters when someone pulls
    // back to work out which continent they're looking at, so it's
    // simplified hard to keep the file small.
    const box = bbox(targets);
    const spanX = box[2] - box[0];
    const spanY = box[3] - box[1];

    const nearBox = [
      box[0] - Math.max(2, spanX * 0.4), box[1] - Math.max(2, spanY * 0.4),
      box[2] + Math.max(2, spanX * 0.4), box[3] + Math.max(2, spanY * 0.4),
    ];
    const farBox = [
      box[0] - Math.max(20, spanX * 2.2), box[1] - Math.max(15, spanY * 2.2),
      box[2] + Math.max(20, spanX * 2.2), box[3] + Math.max(15, spanY * 2.2),
    ];

    const near = all.filter((f) => !targets.includes(f) && overlaps(f, nearBox));
    const far = all.filter(
      (f) => !targets.includes(f) && !near.includes(f) && overlaps(f, farBox)
    );

    const simpleTargets = await simplify(targets, 6);
    const simpleNear = await simplify(near, 3);
    const simpleFar = await simplify(far, 1);
    const simpleContext = [...simpleNear, ...simpleFar];

    answers[region.id] = {};
    const outTargets = simpleTargets.map((f) => {
      const name = f.properties.name;
      const code = codeFor(region.id, name);
      answers[region.id][code] = name;
      return { code, geometry: f.geometry };
    });

    const payload = {
      region: { id: region.id, name: region.name, note: region.note, diff: region.diff, atlas: region.atlas },
      targets: outTargets,
      context: simpleContext.map((f) => ({ geometry: f.geometry })),
    };

    const file = path.join(OUT_PUBLIC, `${region.id}.json`);
    await fs.writeFile(file, JSON.stringify(payload));
    const kb = Math.round((await fs.stat(file)).size / 1024);
    manifest.push({ id: region.id, targets: outTargets.length, kb });
    console.log(`${region.id.padEnd(14)} ${String(outTargets.length).padStart(2)} targets  ${kb} KB`);
  }

  await fs.writeFile(path.join(OUT_SERVER, "answers.json"), JSON.stringify(answers, null, 2));

  if (unmatched.length) {
    console.log("\nNot found in the atlas (usually too small at this scale):");
    unmatched.forEach((u) => console.log("  " + u));
    console.log("Either drop them from data/regions.js or switch that atlas to a finer scale.");
  }
  console.log(`\nTotal ${manifest.reduce((a, m) => a + m.kb, 0)} KB across ${manifest.length} regions.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
