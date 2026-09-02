// One slot, text only, no third-party script, no tracking pixel.
// Set the env vars to fill it. Leave them blank and nothing renders.
//
// If you later switch to a network, EthicalAds and Carbon both drop in
// here as a single script tag. Both want existing traffic before they
// will approve a site, so this starts as a slot you sell yourself.

export default function SponsorSlot() {
  const text = process.env.NEXT_PUBLIC_SPONSOR_TEXT;
  const url = process.env.NEXT_PUBLIC_SPONSOR_URL;
  if (!text || !url) return null;

  return (
    <aside
      style={{
        marginTop: 32, paddingTop: 14,
        borderTop: "1px solid rgba(143,163,169,0.2)",
        fontSize: 13, color: "var(--fog)",
        display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap",
      }}
    >
      <span className="eyebrow">Today&rsquo;s sponsor</span>
      <a href={url} rel="sponsored noopener" target="_blank" style={{ color: "var(--paper)" }}>
        {text}
      </a>
    </aside>
  );
}
