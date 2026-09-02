import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Cartogram — a daily map game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", padding: "0 90px",
          background: "#0F2A33", color: "#EFE7D6",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 6, color: "#8FA3A9", marginBottom: 18 }}>
          A DAILY MAP GAME
        </div>
        <div style={{ fontSize: 108, lineHeight: 1 }}>Cartogram</div>
        <div style={{ fontSize: 34, color: "#8FA3A9", marginTop: 26, maxWidth: 860, lineHeight: 1.35 }}>
          One region. Borders drawn, names removed. Name it outright for
          three, or narrow it to one of three for one.
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 44 }}>
          {["#4E9E7E", "#D9A441", "#C1553B", "#4E9E7E", "#4E9E7E"].map((c, i) => (
            <div key={i} style={{ width: 48, height: 48, background: c, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
