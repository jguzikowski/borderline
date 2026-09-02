import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";

// Self-hosted at build time by next/font, so no layout shift and no
// third-party request. Fraunces has real character in its display
// weights; the mono is for numerals, which should read like instrument
// readings rather than body text.
const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://cartogram.gg";
const DESCRIPTION =
  "The daily map identification game. One region, borders drawn and names removed. Name a place outright for three points, or narrow it to one of three for one.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Cartogram — The Daily Map Identification Game", template: "%s · Cartogram" },
  description: DESCRIPTION,
  applicationName: "Cartogram",
  keywords: ["daily map game", "geography game", "map quiz", "country shapes", "daily puzzle"],
  alternates: { canonical: SITE },
  openGraph: {
    title: "Cartogram — The Daily Map Identification Game",
    description: DESCRIPTION,
    url: SITE,
    siteName: "Cartogram",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cartogram — The Daily Map Identification Game",
    description: DESCRIPTION,
  },
};

export const viewport = {
  themeColor: "#0F2A33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
