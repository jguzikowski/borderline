// Contact and about. A sponsor needs a way to reach you, and so does
// anyone reporting a bad region definition.

export default function SiteFooter() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer style={{
      marginTop: 36, paddingTop: 14,
      borderTop: "1px solid rgba(143,163,169,0.2)",
      fontSize: 12, display: "flex", gap: 14, flexWrap: "wrap",
    }} className="muted">
      <a href="/about" style={{ color: "var(--fog)" }}>About</a>
      {email && (
        <a href={`mailto:${email}?subject=Cartogram`} style={{ color: "var(--fog)" }}>
          Contact
        </a>
      )}
      {email && (
        <a href={`mailto:${email}?subject=Cartogram%20sponsorship`} style={{ color: "var(--fog)" }}>
          Sponsor a day
        </a>
      )}
      <span>Boundaries from Natural Earth, public domain.</span>
    </footer>
  );
}
