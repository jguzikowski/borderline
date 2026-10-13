import { adminClient } from "@/lib/supabase/server";
import { puzzleNumber, regionForPuzzle, dateString } from "@/lib/daily";
import { regionById, TRACKS, trackOf } from "@/data/regions";

// The puzzles table is the source of truth per track. A row there wins
// over the generated rotation, which is what lets you schedule a
// specific region for a specific day.
export async function resolvePuzzle(dayKey, track = "world") {
  const n = puzzleNumber(dayKey);
  const fallback = regionForPuzzle(n, track);

  try {
    const db = adminClient();
    const { data } = await db
      .from("puzzles").select("region_id")
      .eq("n", n).eq("track", track).maybeSingle();
    if (data?.region_id) {
      const pinned = regionById(data.region_id);
      // A pinned region from the wrong track would serve a US map on the
      // world puzzle, so it's ignored rather than trusted.
      if (pinned && trackOf(pinned) === track) return { n, region: pinned, track, pinned: true };
    }
  } catch {
    // Database unreachable: fall back to the rotation rather than 500.
  }
  return { n, region: fallback, track, pinned: false };
}

export async function resolveAllTracks(dayKey) {
  return Promise.all(TRACKS.map((t) => resolvePuzzle(dayKey, t)));
}

// Records the day's region if nothing is scheduled. Never overwrites an
// existing row, so a scheduled override survives the first player.
export async function ensurePuzzleRow(db, dayKey, region, track) {
  const n = puzzleNumber(dayKey);
  const { error } = await db
    .from("puzzles")
    .insert({ n, track, play_date: dateString(dayKey), region_id: region.id, difficulty: region.diff });

  // 23505 is a duplicate key, which is the normal case: the row already
  // exists because someone played earlier today. Anything else is real,
  // and swallowing it just moves the failure somewhere less obvious.
  if (error && error.code !== "23505") throw new Error(`puzzles insert failed: ${error.message}`);
  return n;
}
