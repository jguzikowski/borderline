import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://cartogram.gg";
const DESCRIPTION =
  "A daily map game. One region of the world, borders drawn and names removed. Name a country outright for three points, or narrow it to one of three for one.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Cartogram",
    template: "%s · Cartogram",
  },
  description: DESCRIPTION,
  applicationName: "Cartogram",
  openGraph: {
    title: "Cartogram",
    description: DESCRIPTION,
    url: SITE,
    siteName: "Cartogram",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cartogram",
    description: DESCRIPTION,
  },
  themeColor: "#0F2A33",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}<Analytics /></body>
    </html>
  );
}
