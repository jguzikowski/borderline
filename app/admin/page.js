import { isAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/server";
import { REGIONS, TRACKS, TRACK_LABEL, trackOf } from "@/data/regions";
import { dayKeyFor, puzzleNumber, regionForPuzzle, dateString } from "@/lib/daily";
import AdminLogin from "@/components/AdminLogin";
import AdminSchedule from "@/components/AdminSchedule";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule", robots: { index: false, follow: false } };

const DAYS_AHEAD = 21;

export default async function Admin() {
  if (!isAdmin()) {
    return (
      <main className="wrap">
        <h1 className="region">Schedule</h1>
        <AdminLogin />
      </main>
    );
  }

  const today = dayKeyFor();
  const days = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const dayKey = today + i * 86400000;
    days.push({ dayKey, n: puzzleNumber(dayKey), date: dateString(dayKey) });
  }

  const db = adminClient();
  const first = days[0].n;
  const last = days[days.length - 1].n;

  const { data: scheduled } = await db
    .from("puzzles").select("n, track, region_id").gte("n", first).lte("n", last);
  const { data: played } = await db
    .from("plays").select("puzzle_n, track").gte("puzzle_n", first).lte("puzzle_n", last);

  const pinnedBy = {};
  for (const p of scheduled ?? []) pinnedBy[`${p.n}:${p.track}`] = p.region_id;
  const playCount = {};
  for (const p of played ?? []) {
    const k = `${p.puzzle_n}:${p.track}`;
    playCount[k] = (playCount[k] ?? 0) + 1;
  }

  const boards = TRACKS.map((track) => ({
    track,
    label: TRACK_LABEL[track],
    regions: REGIONS.filter((r) => trackOf(r) === track)
      .map((r) => ({ id: r.id, name: r.name, diff: r.diff, atlas: r.atlas })),
    rows: days.map((d) => {
      const k = `${d.n}:${track}`;
      return {
        ...d,
        track,
        regionId: pinnedBy[k] ?? regionForPuzzle(d.n, track).id,
        pinned: !!pinnedBy[k],
        plays: playCount[k] ?? 0,
        locked: (playCount[k] ?? 0) > 0,
      };
    }),
  }));

  return (
    <main className="wrap">
      <h1 className="region">Schedule</h1>
      <p className="muted" style={{ fontSize: 13, maxWidth: "62ch" }}>
        Two puzzles a day, one per track, each with its own rotation.
        Unscheduled days follow the generated order. A day with plays against it
        is locked, since changing it would invalidate scores people already
        earned. You can unlock one, but that deletes those plays.
      </p>

      {boards.map((b) => (
        <section key={b.track} style={{ marginTop: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{b.label}</div>
          <AdminSchedule rows={b.rows} regions={b.regions} track={b.track} />
        </section>
      ))}

      <p style={{ marginTop: 28, fontSize: 14 }}>
        <a href="/admin/stats" style={{ color: "var(--fog)" }}>Results</a>
        <span className="muted"> · </span>
        <a href="/" style={{ color: "var(--fog)" }}>Back to the game</a>
      </p>
    </main>
  );
}
