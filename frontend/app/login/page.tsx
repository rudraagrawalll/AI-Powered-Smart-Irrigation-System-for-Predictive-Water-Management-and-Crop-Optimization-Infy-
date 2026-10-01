"use client";
import { FormEvent, useState } from "react";
import { saveSession, type Farmer } from "@/lib/auth";
import styles from "./login.module.css";
const API = "";
export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [status, setStatus] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStatus(""); const identity = email.trim(); const normalizedEmail = identity.toLowerCase();
    if (register && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError("Enter a valid email address."); return; }
    if (!register && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) && identity.replace(/\D/g, "").length < 8) { setError("Enter a valid email address or phone number."); return; }
    if (password.length < (register ? 8 : 1)) { setError(register ? "Use at least 8 characters for your password." : "Enter your password."); return; }
    if (register && name.trim().length < 2) { setError("Enter your name."); return; }
    setLoading(true);
    setStatus("Connecting to the sign-in server…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${API}/api/auth/${register ? "signup" : "login"}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(register ? { name: name.trim(), email: normalizedEmail, phone: phone.trim(), password } : { identity, password }), signal: controller.signal });
      const raw = await response.text();
      let data: { error?: string; farmer?: Farmer };
      try { data = raw ? JSON.parse(raw) as { error?: string; farmer?: Farmer } : {}; }
      catch { throw new Error("The sign-in server returned an invalid response. Check that Express is running on port 3000, then retry."); }
      if (!response.ok) throw new Error(data.error || `Could not sign in (HTTP ${response.status}).`);
      if (!data.farmer) throw new Error("The sign-in server response was incomplete. Check the Express server and retry.");
      saveSession(data.farmer);
      // Force the first dashboard session check to send the new HttpOnly cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      setStatus("");
      setError(e instanceof DOMException && e.name === "AbortError" ? "Sign-in request timed out. Check the connection and try again." : e instanceof Error ? e.message : "Cannot reach the server. Check the backend and database are running.");
    } finally { window.clearTimeout(timeout); setLoading(false); }
  }
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}><span className={styles.brandIcon} aria-hidden="true">🌱</span><span>FieldWise</span></div><p className={styles.eyebrow}>YOUR FARM, IN FOCUS</p>
        <h1 id="login-title">{register ? "Create your farmer account" : "Welcome back"}</h1><p className={styles.intro}>{register ? "Create a private account for your fields and crop records." : "Sign in to view field conditions and irrigation guidance."}</p>
        <form action="/login/submit" method="post" onSubmit={submit} noValidate><input type="hidden" name="mode" value={register ? "register" : "login"} />{register && <><label htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /><label htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></>}
          <label htmlFor="email">{register ? "Email address" : "Email or phone"}</label><input id="email" name="identity" type={register ? "email" : "text"} autoComplete={register ? "email" : "username"} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={register ? "farmer@example.com" : "Email or phone number"} required />
          <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className={styles.error} role="alert">{error}</p>}{status && <p role="status" aria-live="polite">{status}</p>}<button className={styles.submit} type="submit" disabled={loading}>{loading ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
        </form><button className={styles.switch} type="button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "Create new farmer account"}</button>
      </section>
    </main>
  );
}
