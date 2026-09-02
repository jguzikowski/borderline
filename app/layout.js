import "./globals.css";

export const metadata = {
  title: "Borderline",
  description: "A daily map game. One region, however many shapes it takes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
