export default function manifest() {
  return {
    name: "Cartogram — The Daily Map Identification Game",
    short_name: "Cartogram",
    description: "One region a day, borders drawn and names removed.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F2A33",
    theme_color: "#0F2A33",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
