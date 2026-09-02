"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";

export default function AuthBar({ signedIn, email, isGuest }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [address, setAddress] = useState("");
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState(null);

  const supabase = browserClient();

  const sendLink = async () => {
    if (!address.trim()) return;
    setSending(true);
    setProblem(null);

    // Falls back to the current origin if the env var is unset, and adds
    // a missing scheme, both of which otherwise fail silently.
    const base = siteUrl();

    // An anonymous player gets upgraded in place, so the scores they've
    // already banked carry over. Everyone else gets a normal magic link.
    const { error } = isGuest
      ? await supabase.auth.updateUser(
          { email: address.trim() },
          { emailRedirectTo: `${base}/auth/callback` }
        )
      : await supabase.auth.signInWithOtp({
          email: address.trim(),
          options: { emailRedirectTo: `${base}/auth/callback` },
        });
    setSending(false);

    // Show what Supabase actually said. A generic message here hides the
    // one piece of information that would tell you what to fix.
    if (error) setProblem(error.message || "That didn't send.");
    else setSent(true);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // Email sign-in stays hidden until SMTP is connected. A form that
  // silently fails is worse than an honest "not yet".
  const emailEnabled = process.env.NEXT_PUBLIC_EMAIL_SIGNIN === "on";

  if (!emailEnabled && !signedIn) {
    return (
      <div style={{ marginTop: 8, fontSize: 11 }} className="muted">
        History is saved in this browser. Accounts are coming.
      </div>
    );
  }

  if (signedIn) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, fontSize: 12 }}>
        <span className="muted">{email}</span>
        <span>
          <a href="/stats" style={{ color: "var(--fog)", marginRight: 12 }}>Your regions</a>
          <button className="quiet" style={{ padding: 0, fontSize: 12 }} onClick={signOut}>Sign out</button>
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {!open && (
        <button className="quiet" style={{ padding: 0, fontSize: 12 }} onClick={() => setOpen(true)}>
          {isGuest ? "Playing as a guest · save your history" : "Sign in to save your history"}
        </button>
      )}
      {open && !sent && (
        <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
          <input type="email" value={address} placeholder="you@example.com"
            aria-label="Email address"
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendLink()} />
          <button className="primary" disabled={sending} onClick={sendLink}>
            {sending ? "Sending" : "Send link"}
          </button>
        </div>
      )}
      {sent && (
        <p style={{ fontSize: 13 }} className="muted">
          {isGuest ? "Check your inbox to confirm. Your scores stay attached." : "Check your inbox for the sign-in link."}
        </p>
      )}
      {problem && <p style={{ fontSize: 13, color: "var(--rust)" }}>{problem}</p>}
    </div>
  );
}
