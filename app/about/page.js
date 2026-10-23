import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "About Cartogram" };

export default function About() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  // Named here on purpose. Directories and aggregators that list the game
  // ask for a page proving who runs it, and the domain itself is the
  // proof: this page is reachable only by whoever controls cartogram.gg.
  const creator = "James Guzikowski";

  return (
    <main className="wrap">
      <h1 className="region">About Cartogram</h1>

      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Every day you get two regions with the borders drawn and the names
        removed: one somewhere in the world, and one in the United States.
        Click a shape and either name it outright for three points, or narrow
        it to one of three for one. A wrong answer costs what a right one
        would have paid, so a confident guess is worth three and a careless
        one costs three.
      </p>

      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Regions are groupings people actually use rather than continents:
        the Sahel, the Southern Cone, landlocked Europe, the Deep South,
        Tornado Alley. They overlap on purpose. Colorado belongs to three of
        them, and Turkey to four.
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Sponsorship
      </h2>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        One text line under the puzzle, no scripts and no tracking pixels.
        {email && (
          <> Write to <a href={`mailto:${email}?subject=Cartogram%20sponsorship`} style={{ color: "var(--paper)" }}>{email}</a> and
          I&rsquo;ll send current numbers.</>
        )}
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Something wrong?
      </h2>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Region membership is a judgement call and some of mine are arguable.
        If a grouping looks wrong, or a name you typed should have counted,
        {email ? <> tell me at <a href={`mailto:${email}?subject=Cartogram%20correction`} style={{ color: "var(--paper)" }}>{email}</a>.</> : " get in touch."}
      </p>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Who makes it
      </h2>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Cartogram is built and run by {creator}, working alone. It isn&rsquo;t
        affiliated with any company or publisher.
        {email && (
          <> For anything to do with the site, including listings, corrections
          and sponsorship, write to{" "}
          <a href={`mailto:${email}?subject=Cartogram`} style={{ color: "var(--paper)" }}>{email}</a>.</>
        )}
      </p>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch", fontSize: 13 }} className="muted">
        Boundary data comes from Natural Earth, which is in the public domain.
        Place details are pulled live from Wikidata and Wikipedia.
      </p>

      <p style={{ marginTop: 28 }}>
        <a href="/" style={{ color: "var(--fog)", fontSize: 14 }}>Back to today&rsquo;s puzzle</a>
      </p>

      <SiteFooter />
    </main>
  );
}
