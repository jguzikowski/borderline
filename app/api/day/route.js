import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { utcDayKey, isPlausibleDayKey, puzzleNumber } from "@/lib/daily";
import { resolveAllTracks } from "@/lib/puzzle";
import { codesForRegion } from "@/lib/answers";

// Both of today's puzzles and how far this player has got with each.
// The switcher needs this before either game starts.
export async function POST(req) {
  const { dayKey: claimed } = await req.json().catch(() => ({}));
  const dayKey = isPlausibleDayKey(claimed) ? claimed : utcDayKey();
  const n = puzzleNumber(dayKey);

  const resolved = await resolveAllTracks(dayKey);

  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  let plays = [];
  if (user) {
    const db = adminClient();
    const { data } = await db
      .from("plays")
      .select("track, score, max_score, completed_at")
      .eq("user_id", user.id)
      .eq("puzzle_n", n);
    plays = data ?? [];
  }

  return NextResponse.json({
    puzzleNumber: n,
    tracks: resolved.map(({ track, region }) => {
      const play = plays.find((p) => p.track === track);
      return {
        track,
        region: { id: region.id, name: region.name, note: region.note, diff: region.diff, atlas: region.atlas },
        total: codesForRegion(region.id).length,
        started: !!play,
        completed: !!play?.completed_at,
        score: play?.completed_at ? play.score : null,
        maxScore: play?.completed_at ? play.max_score : null,
      };
    }),
  });
}
