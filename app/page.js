import Game from "@/components/Game";
import AuthBar from "@/components/AuthBar";
import SponsorSlot from "@/components/SponsorSlot";
import SiteFooter from "@/components/SiteFooter";
import { serverClient } from "@/lib/supabase/server";
import { utcDayKey, puzzleNumber, regionForPuzzle } from "@/lib/daily";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Server-rendered from UTC as a first paint. The client recomputes from
  // its own local date on mount, which is the number that counts.
  const n = puzzleNumber(utcDayKey());
  const region = regionForPuzzle(n);

  return (
    <main className="wrap">
      <AuthBar signedIn={!!user && !user.is_anonymous} email={user?.email ?? null} isGuest={!!user?.is_anonymous} />
      <Game puzzleNumber={n} region={region} signedIn={!!user && !user.is_anonymous} isGuest={!!user?.is_anonymous} />
      <SponsorSlot />
      <SiteFooter />
    </main>
  );
}
