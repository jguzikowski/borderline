import { REGIONS } from "@/data/regions";

// Puzzle 1 is 1 Jan 2026, UTC. Everyone worldwide gets the same region
// on the same UTC day.
export const EPOCH = Date.UTC(2026, 0, 1);

// The puzzle index comes from the local calendar date, not a UTC instant.
// This is how Wordle does it: everyone playing "2 September" gets the same
// puzzle, but it arrives at their own midnight rather than all at once.
export function dayKeyFor(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// UTC reference, used server side to bound what a client may claim.
export function utcDayKey(date = new Date()) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// A client sends its own local day. Real timezones span UTC-12 to UTC+14,
// so anything more than a day either side of UTC is someone reaching for
// a puzzle that isn't theirs yet.
export function isPlausibleDayKey(dayKey, now = new Date()) {
  if (!Number.isInteger(dayKey)) return false;
  return Math.abs(dayKey - utcDayKey(now)) <= 86400000;
}

export function puzzleNumber(dayKey = dayKeyFor()) {
  return Math.floor((dayKey - EPOCH) / 86400000) + 1;
}

export function dateString(dayKey) {
  return new Date(dayKey).toISOString().slice(0, 10);
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWith(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle within difficulty tiers, then deal round-robin so two brutal
// regions never land back to back.
export function cycleOrder(cycle) {
  const rnd = mulberry32(cycle * 7919 + 13);
  const lanes = [
    shuffleWith(rnd, REGIONS.filter((r) => r.diff <= 2)),
    shuffleWith(rnd, REGIONS.filter((r) => r.diff === 3)),
    shuffleWith(rnd, REGIONS.filter((r) => r.diff >= 4)),
  ];
  const out = [];
  let i = 0;
  while (out.length < REGIONS.length) {
    const lane = lanes[i % 3];
    if (lane.length) out.push(lane.shift());
    i++;
  }
  return out;
}

export function regionForPuzzle(n) {
  const cycle = Math.floor((n - 1) / REGIONS.length);
  return cycleOrder(cycle)[(n - 1) % REGIONS.length];
}

export const SCORE = { exact: 3, narrowed: 1, miss_narrow: -1, miss_exact: -3 };
export const CHIP = { exact: "🟩", narrowed: "🟨", miss_narrow: "🟧", miss_exact: "🟥" };
