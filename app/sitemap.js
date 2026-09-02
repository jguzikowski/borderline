const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://cartogram.gg";

export default function sitemap() {
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
