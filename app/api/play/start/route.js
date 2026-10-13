import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { codesForRegion } from "@/lib/answers";
import { utcDayKey, isPlausibleDayKey, isTrack } from "@/lib/daily";
import { resolvePuzzle, ensurePuzzleRow } from "@/lib/puzzle";

// Starts (or resumes) today's play. Returns which shapes are already
// answered so a refresh doesn't lose progress or let you re-guess.
async function handle(req) {
  const { hardMode = false, dayKey: claimed, track: rawTrack } = await req.json().catch(() => ({}));
  const track = isTrack(rawTrack) ? rawTrack : "world";

  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  // The browser reports its own local date. Anything outside a day of UTC
  // is rejected, so nobody can walk the archive by lying about their clock.
  const dayKey = isPlausibleDayKey(claimed) ? claimed : utcDayKey();

  // A scheduled override wins over the generated rotation.
  const { n, region } = await resolvePuzzle(dayKey, track);

  const db = adminClient();
  await ensurePuzzleRow(db, dayKey, region, track);

  let { data: play } = await db
    .from("plays")
    .select("id, hard_mode, completed_at, score, region_id")
    .eq("user_id", user.id)
    .eq("puzzle_n", n)
    .eq("track", track)
    .maybeSingle();

  // A play whose region no longer matches today's is unplayable: its
  // answers reference shapes that aren't on the board, so every lookup
  // comes back as an unknown shape. This happens when the rotation
  // changes under an in-progress round, as it did when the single pool
  // was split into two tracks. An unfinished one is cleared and started
  // again; a finished one is left alone, since that score was earned
  // against the region it was actually played on.
  if (play && play.region_id !== region.id && !play.completed_at) {
    await db.from("plays").delete().eq("id", play.id); // answers cascade
    play = null;
  }

  if (!play) {
    const { data, error } = await db
      .from("plays")
      .insert({
        user_id: user.id,
        puzzle_n: n,
        track,
        region_id: region.id,
        hard_mode: !!hardMode,
        max_score: codesForRegion(region.id).length * 3,
      })
      .select("id, hard_mode, completed_at, score")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    play = data;
  }

  const { data: answered } = await db
    .from("answers")
    .select("code, target_name, outcome, points")
    .eq("play_id", play.id);

  // Streak: consecutive puzzle numbers completed, counting back from
  // today. Today itself doesn't count until it's finished, so a streak
  // shown mid-round is what you're defending, not what you've banked.
  const { data: recent } = await db
    .from("plays")
    .select("puzzle_n")
    .eq("user_id", user.id)
    .eq("track", track)
    .not("completed_at", "is", null)
    .lte("puzzle_n", n)
    .order("puzzle_n", { ascending: false })
    .limit(400);

  let streak = 0;
  const doneNums = new Set((recent ?? []).map((r) => r.puzzle_n));
  let cursor = doneNums.has(n) ? n : n - 1;
  while (doneNums.has(cursor)) { streak++; cursor--; }

  // Their previous run at this region, for the improvement line.
  const { data: prior } = await db
    .from("plays")
    .select("puzzle_n, score, max_score")
    .eq("user_id", user.id)
    .eq("region_id", region.id)
    .not("completed_at", "is", null)
    .order("puzzle_n", { ascending: false })
    .limit(1);

  return NextResponse.json({
    playId: play.id,
    puzzleNumber: n,
    track,
    region: { id: region.id, name: region.name, note: region.note, diff: region.diff, atlas: region.atlas },
    hardMode: play.hard_mode,
    completed: !!play.completed_at,
    answered: answered ?? [],
    lastPlay: prior?.[0] ?? null,
    streak,
    total: codesForRegion(region.id).length,
  });
}

export async function POST(req) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("/api/play/start threw", err);
    return NextResponse.json({ error: err?.message || "Unexpected server error." }, { status: 500 });
  }
}
