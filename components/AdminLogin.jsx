"use client";
import { useState } from "react";

export default function AdminLogin() {
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (r.ok) window.location.reload();
    else setProblem((await r.json().catch(() => ({}))).error || "Sign in failed.");
  };

  return (
    <div style={{ maxWidth: 420, marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="password" value={token} placeholder="Admin token" aria-label="Admin token"
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="primary" disabled={busy || !token} onClick={submit}>
          {busy ? "Checking" : "Enter"}
        </button>
      </div>
      {problem && <p style={{ fontSize: 13, color: "var(--rust)" }}>{problem}</p>}
    </div>
  );
}
