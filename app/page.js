import Game from "@/components/Game";
import AuthBar from "@/components/AuthBar";
import SponsorSlot from "@/components/SponsorSlot";
import SiteFooter from "@/components/SiteFooter";
import { serverClient } from "@/lib/supabase/server";
import { utcDayKey } from "@/lib/daily";
import { resolvePuzzle } from "@/lib/puzzle";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  // First paint from UTC. The client recomputes against its own local
  // date, and the session response is what finally settles the region.
  const { n, region } = await resolvePuzzle(utcDayKey());

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="wordmark">Cartogram</span>
        <span className="tagline">The daily map game</span>
      </div>
      <AuthBar signedIn={!!user && !user.is_anonymous} email={user?.email ?? null} isGuest={!!user?.is_anonymous} />
      <Game puzzleNumber={n} region={region} signedIn={!!user && !user.is_anonymous} isGuest={!!user?.is_anonymous} />
      <SponsorSlot />
      <SiteFooter />
    </main>
  );
}
