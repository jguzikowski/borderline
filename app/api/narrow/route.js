import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { nameForCode, namesForRegion } from "@/lib/answers";
import { mulberry32, shuffleWith } from "@/lib/daily";

// Builds the three-way choice. Decoys are drawn only from shapes still
// unanswered, so elimination never gives the answer away late in a round.
export async function POST(req) {
  const { playId, code } = await req.json().catch(() => ({}));
  if (!playId || !code) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const db = adminClient();
  const { data: play } = await db
    .from("plays").select("id, user_id, region_id, puzzle_n").eq("id", playId).maybeSingle();
  if (!play || play.user_id !== user.id) {
    return NextResponse.json({ error: "not your play" }, { status: 403 });
  }

  const target = nameForCode(play.region_id, code);
  if (!target) return NextResponse.json({ error: "unknown shape" }, { status: 400 });

  const { data: done } = await db.from("answers").select("target_name").eq("play_id", play.id);
  const resolved = new Set((done ?? []).map((d) => d.target_name));

  const rnd = mulberry32(play.puzzle_n * 104729 + code.charCodeAt(0) * 7919 + code.length);
  const live = shuffleWith(
    rnd,
    namesForRegion(play.region_id).filter((nm) => nm !== target && !resolved.has(nm))
  );

  const decoys = live.slice(0, 2);
  // If the region is nearly finished, pad from anywhere rather than
  // reusing something already on the board.
  if (decoys.length < 2) {
    const spare = shuffleWith(rnd, namesForRegion(play.region_id).filter((nm) => nm !== target));
    for (const s of spare) {
      if (decoys.length >= 2) break;
      if (!decoys.includes(s)) decoys.push(s);
    }
  }

  return NextResponse.json({ choices: shuffleWith(rnd, [target, ...decoys]) });
}
