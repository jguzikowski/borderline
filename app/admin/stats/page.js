import { isAdmin } from "@/lib/admin";
import AdminLogin from "@/components/AdminLogin";
import AdminStats from "@/components/AdminStats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results", robots: { index: false, follow: false } };

export default async function StatsPage() {
  if (!isAdmin()) {
    return (
      <main className="wrap">
        <h1 className="region">Results</h1>
        <AdminLogin />
      </main>
    );
  }
  return (
    <main className="wrap" style={{ maxWidth: 880 }}>
      <div className="masthead">
        <span className="wordmark">Cartogram</span>
        <span className="tagline">Results</span>
      </div>
      <AdminStats />
      <p style={{ marginTop: 28, fontSize: 14 }}>
        <a href="/admin" style={{ color: "var(--fog)" }}>Schedule</a>
        <span className="muted"> · </span>
        <a href="/" style={{ color: "var(--fog)" }}>Back to the game</a>
      </p>
    </main>
  );
}
