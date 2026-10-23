import { utcDayKey, puzzleNumber } from "@/lib/daily";
import { resolveAllTracks } from "@/lib/puzzle";
import { TRACK_LABEL } from "@/data/regions";

// A verification page for directory listings. It is proof by control:
// only whoever can deploy cartogram.gg can put this here. Deliberately
// unlinked from the rest of the site and kept out of search results.
//
// Safe to delete once the listings are claimed.

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ownership verification",
  robots: { index: false, follow: false },
};

export default async function Verify() {
  const dayKey = utcDayKey();
  const n = puzzleNumber(dayKey);
  const resolved = await resolveAllTracks(dayKey);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="wordmark">Cartogram</span>
        <span className="tagline">Ownership verification</span>
      </div>

      <h1 className="region" style={{ marginTop: 22 }}>Hello Dailydle</h1>

      <p style={{ lineHeight: 1.65, maxWidth: "62ch" }}>
        This page is on cartogram.gg itself, so only whoever can deploy the
        site could have published it. I am writing it to confirm that the
        Cartogram listing on dailydle.org is mine.
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Who I am
      </h2>
      <p style={{ lineHeight: 1.65, maxWidth: "62ch" }}>
        James Guzikowski. I built Cartogram on my own and run it on my own.
        It isn&rsquo;t affiliated with any company or publisher.
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Addresses to match against
      </h2>
      <p style={{ lineHeight: 1.65, maxWidth: "62ch" }}>
        Either of these is me, so whichever one your records show against the
        original submission is the right one to attach:
      </p>
      <ul style={{ lineHeight: 1.8, fontFamily: "var(--font-mono)", fontSize: 13, maxWidth: "62ch" }}>
        <li>hello@cartogram.gg</li>
        <li>jguzikowski@gmail.com</li>
      </ul>
      <p style={{ lineHeight: 1.65, maxWidth: "62ch" }}>
        What I&rsquo;m after is editing access to the listing. The screenshot
        currently shown is from an older version of the game and I&rsquo;d like
        to replace it, since the site has changed quite a bit since it was
        submitted.
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Live details, as of right now
      </h2>
      <p style={{ lineHeight: 1.65, maxWidth: "62ch", marginBottom: 10 }} className="muted">
        Generated when you loaded this page, which is one way to confirm it is
        coming from the running site rather than a static copy.
      </p>
      <dl style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 16px",
        fontFamily: "var(--font-mono)", fontSize: 13, margin: 0, maxWidth: "62ch",
      }}>
        <dt className="muted">Date</dt>
        <dd style={{ margin: 0 }}>{today} (UTC)</dd>
        <dt className="muted">Puzzle</dt>
        <dd style={{ margin: 0 }}>No. {n}</dd>
        {resolved.map(({ track, region }) => (
          <div key={track} style={{ display: "contents" }}>
            <dt className="muted">{TRACK_LABEL[track]}</dt>
            <dd style={{ margin: 0 }}>{region.name}</dd>
          </div>
        ))}
      </dl>

      <p style={{ marginTop: 30, fontSize: 14 }}>
        <a href="/" style={{ color: "var(--fog)" }}>cartogram.gg</a>
        <span className="muted"> · </span>
        <a href="/about" style={{ color: "var(--fog)" }}>About the game</a>
      </p>

      <p style={{ marginTop: 26, fontSize: 13, lineHeight: 1.6 }} className="muted">
        Thanks for running the directory. It has been the single biggest
        source of players for this game.
      </p>
    </main>
  );
}
