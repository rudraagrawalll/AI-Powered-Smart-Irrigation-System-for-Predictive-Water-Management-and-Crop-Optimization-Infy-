"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearSession, getSession, logout, validateSession, type Farmer } from "@/lib/auth";
import styles from "./auth-gate.module.css";
export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const isLogin = pathname === "/login";
  const [farmer, setFarmer] = useState<Farmer | null>(null); const [ready, setReady] = useState(false); const [connectionError, setConnectionError] = useState(false);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) {
        setReady(true);
        const saved = getSession();
        setFarmer(saved);
        if (!saved) setConnectionError(true);
      }
    }, 4000);

    validateSession()
      .then((value) => { if (active) { setFarmer(value); setConnectionError(false); } })
      .catch(() => {
        if (active) {
          const fallback = getSession();
          if (fallback) {
            setFarmer(fallback);
          } else {
            clearSession();
            setFarmer(null);
            setConnectionError(true);
          }
        }
      })
      .finally(() => {
        if (active) {
          clearTimeout(timeout);
          setReady(true);
        }
      });

    const onChange = () => setFarmer(getSession());
    window.addEventListener("irrigation-session-change", onChange);
    return () => { active = false; clearTimeout(timeout); window.removeEventListener("irrigation-session-change", onChange); };
  }, [isLogin]);
  useEffect(() => { if (!ready) return; if (isLogin && farmer) router.replace("/"); else if (!isLogin && !farmer) router.replace("/login"); }, [farmer, isLogin, ready, router]);
  if (!ready && !isLogin) return <main className={styles.loading} aria-live="polite"><p>Loading your farm dashboard…</p><a href="/login">Go to sign in</a></main>;
  if (connectionError && !farmer && !isLogin) return <main className={styles.loading} aria-live="polite"><p>Cannot verify your account right now.</p><p>Check that the backend is reachable on port 3000, or sign in again.</p><button type="button" onClick={() => router.replace("/login")}>Go to sign in</button><button type="button" onClick={() => window.location.reload()}>Retry</button></main>;
  if (isLogin) return children;
  if (!farmer) return <main className={styles.loading} aria-live="polite"><p>Sign in to continue.</p><a href="/login">Go to sign in</a></main>;
  return <><div className={styles.demoBar}><span>Signed in as <strong>{farmer.name}</strong> · Farmer #{farmer.farmer_id}</span><button type="button" onClick={() => { void logout().finally(() => router.replace("/login")); }}>Log out</button></div>{children}</>;
}
