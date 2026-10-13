import DailyBoard from "@/components/DailyBoard";
import Announcement from "@/components/Announcement";
import AuthBar from "@/components/AuthBar";
import SponsorSlot from "@/components/SponsorSlot";
import SiteFooter from "@/components/SiteFooter";
import { serverClient } from "@/lib/supabase/server";
import { utcDayKey, puzzleNumber } from "@/lib/daily";
import { resolveAllTracks } from "@/lib/puzzle";
import { codesForRegion } from "@/lib/answers";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  // First paint from UTC with no play data. The client recomputes
  // against its own local date and fills in progress on mount.
  const dayKey = utcDayKey();
  const resolved = await resolveAllTracks(dayKey);

  const initial = {
    puzzleNumber: puzzleNumber(dayKey),
    tracks: resolved.map(({ track, region }) => ({
      track,
      region: { id: region.id, name: region.name, note: region.note, diff: region.diff, atlas: region.atlas },
      total: codesForRegion(region.id).length,
      started: false,
      completed: false,
      score: null,
      maxScore: null,
    })),
  };

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="wordmark">Cartogram</span>
        <span className="tagline">Two maps a day</span>
      </div>
      <AuthBar signedIn={!!user && !user.is_anonymous} email={user?.email ?? null} isGuest={!!user?.is_anonymous} />
      <Announcement />
      <DailyBoard initial={initial} signedIn={!!user && !user.is_anonymous} isGuest={!!user?.is_anonymous} />
      <SponsorSlot />
      <SiteFooter />
    </main>
  );
}
