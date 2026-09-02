import { isAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/server";
import { REGIONS } from "@/data/regions";
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
    .from("puzzles").select("n, region_id").gte("n", first).lte("n", last);
  const { data: played } = await db
    .from("plays").select("puzzle_n").gte("puzzle_n", first).lte("puzzle_n", last);

  const pinnedBy = Object.fromEntries((scheduled ?? []).map((p) => [p.n, p.region_id]));
  const playCount = {};
  for (const p of played ?? []) playCount[p.puzzle_n] = (playCount[p.puzzle_n] ?? 0) + 1;

  const rows = days.map((d) => ({
    ...d,
    regionId: pinnedBy[d.n] ?? regionForPuzzle(d.n).id,
    pinned: !!pinnedBy[d.n],
    locked: (playCount[d.n] ?? 0) > 0,
  }));

  const regions = REGIONS.map((r) => ({ id: r.id, name: r.name, diff: r.diff, atlas: r.atlas }));

  return (
    <main className="wrap">
      <h1 className="region">Schedule</h1>
      <p className="muted" style={{ fontSize: 13, maxWidth: "60ch" }}>
        Unscheduled days follow the generated rotation. Setting one here pins it.
        A day with plays against it is locked, since changing it would invalidate
        scores people already earned.
      </p>
      <AdminSchedule rows={rows} regions={regions} />
      <p style={{ marginTop: 24 }}>
        <a href="/" style={{ color: "var(--fog)", fontSize: 14 }}>Back to the game</a>
      </p>
    </main>
  );
}
