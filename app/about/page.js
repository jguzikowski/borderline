import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "About Cartogram" };

export default function About() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <main className="wrap">
      <h1 className="region">About Cartogram</h1>

      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Every day you get one region of the world with the borders drawn and
        the names removed. Click a shape and either name it outright for three
        points, or narrow it to one of three for one. A wrong answer costs what
        a right one would have paid, so a confident guess is worth three and a
        careless one costs three.
      </p>

      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Regions are groupings people actually use rather than continents:
        the Sahel, the Deep South, the Southern Cone, landlocked Europe.
        They overlap on purpose. Colorado belongs to three of them.
      </p>

      <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Sponsorship
      </h2>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        One text line under the puzzle, no scripts and no tracking pixels.
        {email && (
          <> Write to <a href={`mailto:${email}?subject=Cartogram%20sponsorship`} style={{ color: "var(--paper)" }}>{email}</a> and
          I&rsquo;ll send current numbers.</>
        )}
      </p>

      <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 20, marginTop: 28 }}>
        Something wrong?
      </h2>
      <p style={{ lineHeight: 1.6, maxWidth: "60ch" }}>
        Region membership is a judgement call and some of mine are arguable.
        If a grouping looks wrong, or a name you typed should have counted,
        {email ? <> tell me at <a href={`mailto:${email}?subject=Cartogram%20correction`} style={{ color: "var(--paper)" }}>{email}</a>.</> : " get in touch."}
      </p>

      <p style={{ marginTop: 28 }}>
        <a href="/" style={{ color: "var(--fog)", fontSize: 14 }}>Back to today&rsquo;s puzzle</a>
      </p>

      <SiteFooter />
    </main>
  );
}
