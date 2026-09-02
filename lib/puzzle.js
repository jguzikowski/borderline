import { adminClient } from "@/lib/supabase/server";
import { puzzleNumber, regionForPuzzle, dateString } from "@/lib/daily";
import { regionById } from "@/data/regions";

// The puzzles table is the source of truth. A row there wins over the
// generated rotation, which is what lets you schedule a specific region
// for a specific day. With no row, the rotation decides and the choice
// gets recorded so it can't drift later.
export async function resolvePuzzle(dayKey) {
  const n = puzzleNumber(dayKey);
  const fallback = regionForPuzzle(n);

  try {
    const db = adminClient();
    const { data } = await db.from("puzzles").select("region_id").eq("n", n).maybeSingle();
    if (data?.region_id) {
      const pinned = regionById(data.region_id);
      if (pinned) return { n, region: pinned, pinned: true };
    }
  } catch {
    // Database unreachable: fall back to the rotation rather than 500.
  }
  return { n, region: fallback, pinned: false };
}

// Records the day's region if nothing is scheduled. Never overwrites an
// existing row, so a scheduled override survives the first player.
export async function ensurePuzzleRow(db, dayKey, region) {
  const n = puzzleNumber(dayKey);
  await db
    .from("puzzles")
    .insert({ n, play_date: dateString(dayKey), region_id: region.id, difficulty: region.diff })
    .then(() => {}, () => {}); // duplicate key is the expected no-op
  return n;
}
